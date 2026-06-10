import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import ffmpegCoreUrl from '@ffmpeg/core?url';
import ffmpegWasmUrl from '@ffmpeg/core/wasm?url';
import {
  getChunkStatus,
  initiateUpload,
  resumeUpload,
  isNetworkError,
} from './api';
import { clearSession, loadSession, saveSession } from './sessionStorage';
import type {
  ChunkInfo,
  ChunkStatusItem,
  LocalChunk,
  SavedSession,
  UploadPhase,
  UploadStep,
} from './types';
import { putObjectWithProgress } from './uploadRequest';
import { formatBytes } from './utils';

const DEFAULT_CONCURRENCY = Number(import.meta.env.VITE_UPLOAD_CONCURRENCY ?? 3);

interface StartUploadInput {
  caseId: string;
  file: File;
  chunkDuration: number;
  concurrency?: number;
}

const ffmpeg = new FFmpeg();
let ffmpegLoadPromise: Promise<void> | null = null;

async function ensureFfmpegLoaded() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = ffmpeg.load({
      coreURL: ffmpegCoreUrl,
      wasmURL: ffmpegWasmUrl,
    }).then(() => undefined);
  }
  await ffmpegLoadPromise;
}

function toLocalChunks(infos: ChunkInfo[], blobsByIndex: Map<number, Blob>): LocalChunk[] {
  return infos.map((info) => ({
    ...info,
    blob: blobsByIndex.get(info.chunkIndex),
    blobSize: blobsByIndex.get(info.chunkIndex)?.size,
    status: 'pending',
    uploadProgress: 0,
  }));
}

function mergeStatus(chunks: LocalChunk[], statusItems: ChunkStatusItem[]) {
  if (chunks.length === 0) {
    return statusItems
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((remote) => ({
        chunkIndex: remote.chunkIndex,
        chunkId: remote.chunkId,
        startTime: remote.startTime,
        endTime: remote.endTime,
        s3Key: remote.status === 'pending' || remote.status === 'failed' ? '' : '',
        presignedUrl: '',
        expiresIn: 0,
        status: remote.status,
        uploadProgress: remote.status === 'pending' || remote.status === 'failed' ? 0 : 100,
        eTag: remote.eTag,
        metadataS3Key: remote.metadataS3Key,
        frameCount: remote.frameCount,
      }));
  }

  const byIndex = new Map(statusItems.map((item) => [item.chunkIndex, item]));
  return chunks.map((chunk) => {
    const remote = byIndex.get(chunk.chunkIndex);
    if (!remote) return chunk;

    return {
      ...chunk,
      chunkId: remote.chunkId,
      startTime: remote.startTime,
      endTime: remote.endTime,
      status: remote.status,
      uploadProgress: remote.status === 'pending' || remote.status === 'failed' ? chunk.uploadProgress : 100,
      eTag: remote.eTag ?? chunk.eTag,
      metadataS3Key: remote.metadataS3Key,
      frameCount: remote.frameCount,
    };
  });
}

function collectStatusItems(response: Awaited<ReturnType<typeof getChunkStatus>>) {
  return [...response.pendingChunks, ...response.failedChunks, ...response.activeChunks];
}

export function useChunkUpload() {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [caseId, setCaseId] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [chunkDuration, setChunkDuration] = useState(300);
  const [chunks, setChunks] = useState<LocalChunk[]>([]);
  const chunksRef = useRef<LocalChunk[]>([]);
  const [lastStatus, setLastStatus] = useState<Awaited<ReturnType<typeof getChunkStatus>> | null>(null);
  const [splitProgress, setSplitProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<UploadStep>('Idle');
  const [events, setEvents] = useState<string[]>([]);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(() => loadSession());
  const abortControllers = useRef(new Map<number, AbortController>());
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  const logEvent = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEvents((current) => [`${timestamp} ${message}`, ...current].slice(0, 80));
  }, []);

  const stats = useMemo(() => {
    const totalChunks = chunks.length || lastStatus?.totalChunks || 0;
    const uploadedCount = chunks.filter((chunk) =>
      ['uploaded', 'processing', 'done'].includes(chunk.status),
    ).length;
    const doneCount = chunks.filter((chunk) => chunk.status === 'done').length;
    const failedCount = chunks.filter((chunk) => chunk.status === 'failed').length;
    const pendingCount = chunks.filter((chunk) => chunk.status === 'pending').length;
    const uploadingCount = chunks.filter((chunk) => chunk.status === 'uploading').length;
    const uploadBytes = chunks.reduce((sum, chunk) => {
      const size = chunk.blobSize ?? 0;
      return sum + size * (chunk.uploadProgress / 100);
    }, 0);
    const totalBytes = chunks.reduce((sum, chunk) => sum + (chunk.blobSize ?? 0), 0) || fileSize;

    return {
      totalChunks,
      uploadedCount,
      doneCount,
      failedCount,
      pendingCount,
      uploadingCount,
      uploadProgress: totalChunks ? (uploadedCount / totalChunks) * 100 : 0,
      processingProgress: totalChunks ? (doneCount / totalChunks) * 100 : 0,
      byteProgress: totalBytes ? (uploadBytes / totalBytes) * 100 : 0,
    };
  }, [chunks, fileSize, lastStatus]);

  const splitFile = useCallback(async (file: File, duration: number) => {
    setSplitProgress(0);
    setCurrentStep('Loading FFmpeg.wasm');
    logEvent('Loading FFmpeg.wasm assets');
    await ensureFfmpegLoaded();

    ffmpeg.on('progress', ({ progress }) => {
      setSplitProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
    });

    const inputName = 'input.mp4';
    setCurrentStep('Writing source video into FFmpeg');
    logEvent(`Writing ${file.name} into FFmpeg memory`);
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    setCurrentStep('Splitting video into MP4 chunks');
    logEvent(`Splitting video by ${duration}s segments`);
    await ffmpeg.exec([
      '-i',
      inputName,
      '-c',
      'copy',
      '-f',
      'segment',
      '-segment_time',
      String(duration),
      '-reset_timestamps',
      '1',
      '-map',
      '0',
      'chunk_%04d.mp4',
    ]);

    setCurrentStep('Reading split chunks');
    const entries = await ffmpeg.listDir('/');
    const chunkNames = entries
      .map((entry) => entry.name)
      .filter((name) => /^chunk_\d{4}\.mp4$/.test(name))
      .sort();

    const blobs = new Map<number, Blob>();
    for (const name of chunkNames) {
      const data = await ffmpeg.readFile(name);
      const chunkIndex = Number(name.match(/\d{4}/)?.[0] ?? 0);
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const copy: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      blobs.set(chunkIndex, new Blob([copy.buffer], { type: file.type || 'video/mp4' }));
      await ffmpeg.deleteFile(name);
    }
    await ffmpeg.deleteFile(inputName);
    setSplitProgress(100);
    logEvent(`Split finished: ${blobs.size} chunks`);
    return blobs;
  }, [logEvent]);

  const refreshStatus = useCallback(async (id = videoId) => {
    if (!id) return null;
    setCurrentStep('Refreshing backend chunk status');
    try {
      const status = await getChunkStatus(id);
      setLastStatus(status);
      setChunks((current) => mergeStatus(current, collectStatusItems(status)));
      logEvent(`Status fetched: ${status.activeChunks.length}/${status.totalChunks} active chunks`);
      return status;
    } catch (err) {
      if (isNetworkError(err)) {
        logEvent('Status poll skipped: network offline');
        return null;
      }
      throw err;
    }
  }, [logEvent, videoId]);

  const uploadChunk = useCallback(
    async (activeVideoId: string, chunk: LocalChunk, mimeType: string) => {
      if (!chunk.blob) {
        const errMsg = `Chunk ${chunk.chunkIndex}: Missing Blob. Select the original file again before resuming.`;
        logEvent(`ERROR: ${errMsg}`);
        setChunks((current) =>
          current.map((item) =>
            item.chunkIndex === chunk.chunkIndex
              ? { ...item, status: 'failed', error: errMsg }
              : item,
          ),
        );
        throw new Error(errMsg);
      }

      const controller = new AbortController();
      abortControllers.current.set(chunk.chunkIndex, controller);

      try {
        setChunks((current) =>
          current.map((item) =>
            item.chunkIndex === chunk.chunkIndex
              ? { ...item, status: 'uploading', uploadProgress: 0, error: undefined }
              : item,
          ),
        );

        logEvent(
          `Chunk ${chunk.chunkIndex}: PUT to MinIO start (${formatBytes(chunk.blobSize ?? 0)})`,
        );

        const result = await putObjectWithProgress(
          chunk.presignedUrl,
          chunk.blob,
          mimeType || 'video/mp4',
          (progress) => {
            setChunks((current) =>
              current.map((item) =>
                item.chunkIndex === chunk.chunkIndex ? { ...item, uploadProgress: progress } : item,
              ),
            );
          },
          controller.signal,
        );

        logEvent(`Chunk ${chunk.chunkIndex}: PUT success, ETag received`);

        // Optimistically mark as uploaded — backend will sync via MinIO event
        setChunks((current) =>
          current.map((item) =>
            item.chunkIndex === chunk.chunkIndex
              ? { ...item, status: 'uploaded', eTag: result.eTag, uploadProgress: 100, error: undefined }
              : item,
          ),
        );
        abortControllers.current.delete(chunk.chunkIndex);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown upload error';

        if (controller.signal.aborted) {
          setChunks((current) =>
            current.map((item) =>
              item.chunkIndex === chunk.chunkIndex
                ? { ...item, status: 'pending', error: 'Cancelled by user' }
                : item,
            ),
          );
          abortControllers.current.delete(chunk.chunkIndex);
          throw err;
        }

        logEvent(`Chunk ${chunk.chunkIndex}: FAILED — ${message}`);
        setChunks((current) =>
          current.map((item) =>
            item.chunkIndex === chunk.chunkIndex
              ? { ...item, status: 'failed', error: message }
              : item,
          ),
        );
        abortControllers.current.delete(chunk.chunkIndex);
        throw err;
      }
    },
    [logEvent],
  );

  const uploadQueue = useCallback(
    async (
      activeVideoId: string,
      targets: LocalChunk[],
      mimeType: string,
      concurrency = DEFAULT_CONCURRENCY,
    ) => {
      if (targets.length === 0) {
        logEvent('Upload queue: no targets to upload');
        setPhase('paused');
        setCurrentStep('Paused');
        return;
      }

      setPhase('uploading');
      setCurrentStep('Uploading chunks to MinIO');
      logEvent(`Upload queue start: ${targets.length} chunks, concurrency ${Math.max(1, concurrency)}`);

      let cursor = 0;
      let successCount = 0;
      let failCount = 0;

      async function worker(workerId: number) {
        while (cursor < targets.length) {
          const index = cursor++;
          const next = targets[index];
          logEvent(`Worker ${workerId}: picking chunk ${next.chunkIndex}`);

          try {
            await uploadChunk(activeVideoId, next, mimeType);
            successCount++;
            logEvent(`Worker ${workerId}: chunk ${next.chunkIndex} done`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'unknown';
            failCount++;
            logEvent(`Worker ${workerId}: chunk ${next.chunkIndex} error (${msg})`);
          }
        }
        logEvent(`Worker ${workerId}: finished (success=${successCount}, fail=${failCount})`);
      }

      const workers = Array.from({ length: Math.max(1, concurrency) }, (_, i) => worker(i));
      await Promise.allSettled(workers);

      logEvent(`Upload queue done: ${successCount} success, ${failCount} failed`);

      const status = await refreshStatus(activeVideoId);
      const allDone = status && status.activeChunks.length === status.totalChunks;
      setPhase(allDone ? 'completed' : 'paused');
      setCurrentStep(allDone ? 'Completed' : 'Paused');
    },
    [logEvent, refreshStatus, uploadChunk],
  );

  const startUpload = useCallback(
    async ({ caseId: inputCaseId, file, chunkDuration: duration, concurrency }: StartUploadInput) => {
      setError(null);
      setEvents([]);
      setCurrentStep('Loading FFmpeg.wasm');
      setCaseId(inputCaseId);
      setFilename(file.name);
      setFileSize(file.size);
      setChunkDuration(duration);
      setVideoId(null);
      setChunks([]);
      setLastStatus(null);

      try {
        setPhase('splitting');
        const blobs = await splitFile(file, duration);
        if (blobs.size === 0) {
          throw new Error('FFmpeg did not produce any chunks. Check that the selected video is readable by FFmpeg.');
        }

        setPhase('initiating');
        setCurrentStep('Creating upload session in case-service');
        logEvent(`Creating upload session for ${blobs.size} chunks`);
        const initiated = await initiateUpload({
          caseId: inputCaseId,
          filename: file.name,
          totalChunks: blobs.size,
          chunkDuration: duration,
          mimeType: file.type || 'video/mp4',
          estimatedTotalSize: file.size,
        });

        setVideoId(initiated.videoId);
        logEvent(`case-service created videoId ${initiated.videoId}`);
        const localChunks = toLocalChunks(initiated.chunks, blobs);
        setChunks(localChunks);

        const session = {
          videoId: initiated.videoId,
          caseId: inputCaseId,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type || 'video/mp4',
          chunkDuration: duration,
          createdAt: new Date().toISOString(),
        };
        saveSession(session);
        setSavedSession(session);

        await uploadQueue(initiated.videoId, localChunks, file.type || 'video/mp4', concurrency);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload flow failed';
        setPhase('error');
        setCurrentStep('Error');
        setError(message);
        logEvent(`Upload flow stopped: ${message}`);
      }
    },
    [logEvent, splitFile, uploadQueue],
  );

  const resumeCurrentUpload = useCallback(
    async (file?: File, concurrency?: number) => {
      if (!videoId) {
        setError('No videoId to resume.');
        return;
      }

      setError(null);
      logEvent('Resume requested');

      const status = await refreshStatus(videoId);
      if (!status) return;

      // รวม pending + failed ที่ยังไม่เสร็จ
      const pendingIndexes = [
        ...status.pendingChunks.map((c) => c.chunkIndex),
        ...status.failedChunks.map((c) => c.chunkIndex),
      ];

      if (pendingIndexes.length === 0) {
        setPhase(status.activeChunks.length === status.totalChunks ? 'completed' : 'paused');
        setCurrentStep(status.activeChunks.length === status.totalChunks ? 'Completed' : 'Paused');
        return;
      }

      let blobsByIndex = new Map<number, Blob>();
      const mimeType = file?.type || savedSession?.mimeType || 'video/mp4';
      if (file) {
        setPhase('splitting');
        blobsByIndex = await splitFile(file, chunkDuration);
      }

      setPhase('initiating');
      setCurrentStep('Creating upload session in case-service');
      logEvent(`Requesting fresh URLs for ${pendingIndexes.length} pending chunks`);
      const resume = await resumeUpload(videoId, { chunkIndexes: pendingIndexes });
      const urlByIndex = new Map(resume.chunks.map((chunk) => [chunk.chunkIndex, chunk]));

      setChunks((current) =>
        current.map((chunk) => {
          const freshUrl = urlByIndex.get(chunk.chunkIndex);
          if (!freshUrl) return chunk;
          return {
            ...chunk,
            ...freshUrl,
            blob: blobsByIndex.get(chunk.chunkIndex) ?? chunk.blob,
            blobSize: blobsByIndex.get(chunk.chunkIndex)?.size ?? chunk.blobSize,
            status: 'pending',
            error: undefined,
          };
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      const latestChunks = chunksRef.current
        .map((chunk) => {
          const freshUrl = urlByIndex.get(chunk.chunkIndex);
          if (!freshUrl) return chunk;
          return {
            ...chunk,
            ...freshUrl,
            blob: blobsByIndex.get(chunk.chunkIndex) ?? chunk.blob,
            blobSize: blobsByIndex.get(chunk.chunkIndex)?.size ?? chunk.blobSize,
            status: 'pending' as const,
            error: undefined,
          };
        })
        .filter((chunk) => pendingIndexes.includes(chunk.chunkIndex));

      const missingBlob = latestChunks.filter((c) => !c.blob);
      if (missingBlob.length > 0) {
        const msg = `Missing video file for chunks ${missingBlob.map((c) => c.chunkIndex).join(', ')}. Please select the original file again.`;
        setError(msg);
        setPhase('error');
        setCurrentStep('Error');
        logEvent(`Resume aborted: ${msg}`);
        return;
      }

      await uploadQueue(videoId, latestChunks, mimeType, concurrency);
    },
    [chunkDuration, logEvent, refreshStatus, savedSession, splitFile, uploadQueue, videoId],
  );

  const attachSavedSession = useCallback((session: SavedSession) => {
    setSavedSession(session);
    setVideoId(session.videoId);
    setCaseId(session.caseId);
    setFilename(session.filename);
    setFileSize(session.fileSize);
    setChunkDuration(session.chunkDuration);
  }, []);

  const cancelUpload = useCallback(() => {
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    setPhase('cancelled');
    setCurrentStep('Cancelled');
    logEvent('Upload cancelled by user');
  }, [logEvent]);

  const resetUpload = useCallback(() => {
    cancelUpload();
    clearSession();
    setSavedSession(null);
    setPhase('idle');
    setCaseId('');
    setVideoId(null);
    setFilename('');
    setFileSize(0);
    setChunks([]);
    setLastStatus(null);
    setError(null);
    setCurrentStep('Idle');
    setEvents([]);
    setSplitProgress(0);
  }, [cancelUpload]);

  // ✅ polling จะทำงานต่อเนื่องจนกว่าทุก chunk จะเป็น done หรือ failed
  useEffect(() => {
    if (!videoId || !['uploading', 'paused', 'completed'].includes(phase)) return;

    // ตรวจสอบว่ายังมี chunk ที่ยังประมวลผลไม่เสร็จ (ยังไม่เป็น done หรือ failed) หรือไม่
    const hasUnfinished = chunks.length > 0 && chunks.some(
      (chunk) => chunk.status !== 'done' && chunk.status !== 'failed'
    );
    if (!hasUnfinished) return;

    pollTimer.current = window.setInterval(() => {
      refreshStatus().catch((err) => {
        if (!isNetworkError(err)) {
          setError(err instanceof Error ? err.message : 'Status polling failed');
        }
      });
    }, 5_000);

    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [phase, refreshStatus, videoId, chunks]);

  return {
    phase,
    caseId,
    videoId,
    filename,
    fileSize,
    chunkDuration,
    chunks,
    stats,
    lastStatus,
    splitProgress,
    error,
    currentStep,
    events,
    savedSession,
    setChunkDuration,
    startUpload,
    resumeCurrentUpload,
    refreshStatus,
    attachSavedSession,
    cancelUpload,
    resetUpload,
  };
}