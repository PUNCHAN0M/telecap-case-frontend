import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import type { ChunkFallbackItem } from './types';
import { getHlsStatus, seek as seekApi } from './api';

export interface VideoPlayerState {
  phase: 'loading' | 'hls' | 'chunks' | 'processing' | 'not_available' | 'error';
  currentTime: number;
  duration: number;
  totalDuration: number;
  isPlaying: boolean;
  isBuffering: boolean;
  error: string | null;
  masterUrl?: string;
  fallbackChunks?: ChunkFallbackItem[];
}

export function useVideoPlayer(videoId: string) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const initializedChunkRef = useRef(false);

  const [state, setState] = useState<VideoPlayerState>({
    phase: 'loading',
    currentTime: 0,
    duration: 0,
    totalDuration: 0,
    isPlaying: false,
    isBuffering: false,
    error: null,
  });

  // ✅ Internal counter สำหรับ trigger re-fetch
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ── Fetch HLS status ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        console.log(`[VideoPlayer] Fetching HLS status for ${videoId}`);
        const status = await getHlsStatus(videoId);
        if (cancelled) return;

        console.log(`[VideoPlayer] HLS status:`, status);

        // ✅ คำนวณ totalDuration อย่างปลอดภัย (มี fallback ทุกกรณี)
        let totalDuration = 0;

        // ลำดับความสำคัญ: 1. status.totalDuration จาก backend
        if (typeof status.totalDuration === 'number' && status.totalDuration > 0) {
          totalDuration = status.totalDuration;
        } 
        // 2. คำนวณจาก fallback chunks
        else if (status.fallback?.chunks && Array.isArray(status.fallback.chunks) && status.fallback.chunks.length > 0) {
          const lastChunk = status.fallback.chunks[status.fallback.chunks.length - 1];
          totalDuration = lastChunk?.endTime ?? 0;
        }
        // 3. ถ้าเป็น ready แต่ไม่มี totalDuration ใช้ segmentDuration * estimate
        else if (status.status === 'ready' && typeof status.segmentDuration === 'number') {
          totalDuration = status.segmentDuration * 10; // estimate 10 segments
        }

        console.log(`[VideoPlayer] Calculated totalDuration: ${totalDuration}`);

        if (status.status === 'ready' && status.masterUrl) {
          const baseURL = import.meta.env.VITE_CASE_SERVICE_URL ?? 'http://localhost:3000';
          const fullMasterUrl = status.masterUrl.startsWith('http') ? status.masterUrl : `${baseURL}${status.masterUrl}`;
          setState((s) => ({
            ...s,
            phase: 'hls',
            masterUrl: fullMasterUrl,
            totalDuration,
            error: null,
          }));
        } else if (status.status === 'processing' && status.fallback?.chunks && status.fallback.chunks.length > 0) {
          console.log(`[VideoPlayer] Using chunk fallback, ${status.fallback.chunks.length} chunks`);
          setState((s) => ({
            ...s,
            phase: 'chunks',
            fallbackChunks: status.fallback!.chunks,
            totalDuration,
            error: null,
          }));
        } else if (status.status === 'processing') {
          setState((s) => ({
            ...s,
            phase: 'processing',
            totalDuration,
            error: null,
          }));
        } else if (status.status === 'not_available') {
          setState((s) => ({
            ...s,
            phase: 'not_available',
            error: status.message ?? 'Video not available',
            totalDuration,
          }));
        } else {
          // fallback กรณี status แปลกๆ
          setState((s) => ({
            ...s,
            phase: 'not_available',
            error: status.message ?? 'Unknown video status',
            totalDuration,
          }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error(`[VideoPlayer] Failed to load:`, err);
        setState((s) => ({
          ...s,
          phase: 'error',
          error: err instanceof Error ? err.message : 'Failed to load video',
        }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [videoId, refreshTrigger]);

  // ── Auto-poll HLS Status ──
  useEffect(() => {
    if (state.phase !== 'processing' && state.phase !== 'chunks') return;

    let timeoutId: number;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const status = await getHlsStatus(videoId);
        if (cancelled) return;

        let newTotalDuration = 0;
        if (typeof status.totalDuration === 'number' && status.totalDuration > 0) {
          newTotalDuration = status.totalDuration;
        } else if (status.fallback?.chunks && status.fallback.chunks.length > 0) {
          const lastChunk = status.fallback.chunks[status.fallback.chunks.length - 1];
          newTotalDuration = lastChunk?.endTime ?? 0;
        }

        if (status.status === 'ready' && status.masterUrl) {
          console.log(`[VideoPlayer] Polling found HLS ready! Switching phase.`);
          const baseURL = import.meta.env.VITE_CASE_SERVICE_URL ?? 'http://localhost:3000';
          const fullMasterUrl = status.masterUrl.startsWith('http') ? status.masterUrl : `${baseURL}${status.masterUrl}`;
          setState((s) => ({
            ...s,
            phase: 'hls',
            masterUrl: fullMasterUrl,
            totalDuration: newTotalDuration,
          }));
        } else if (status.status === 'processing' && status.fallback?.chunks) {
          // Update fallback chunks quietly if more chunks arrived
          setState((s) => {
            const currentChunksCount = s.fallbackChunks?.length || 0;
            const newChunksCount = status.fallback!.chunks.length;
            if (newChunksCount > currentChunksCount) {
               console.log(`[VideoPlayer] Polling found more chunks: ${newChunksCount}`);
               return {
                 ...s,
                 fallbackChunks: status.fallback!.chunks,
                 totalDuration: newTotalDuration,
               };
            }
            return s;
          });
          timeoutId = window.setTimeout(poll, 10000);
        } else {
          timeoutId = window.setTimeout(poll, 10000);
        }
      } catch (err) {
        console.error('[VideoPlayer] Polling error:', err);
        timeoutId = window.setTimeout(poll, 10000);
      }
    }

    timeoutId = window.setTimeout(poll, 10000);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [videoId, state.phase]);

  // ── Setup HLS player ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn('[VideoPlayer] videoRef is null');
      return;
    }
    if (state.phase !== 'hls') {
      console.log(`[VideoPlayer] phase is ${state.phase}, skipping HLS setup`);
      return;
    }
    if (!state.masterUrl) {
      console.warn('[VideoPlayer] masterUrl is empty');
      return;
    }

    console.log(`[VideoPlayer] Setting up HLS player with URL: ${state.masterUrl}`);

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      console.log('[VideoPlayer] Destroying previous HLS instance');
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      console.log('[VideoPlayer] Hls.js is supported, creating instance');
      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
        startLevel: -1,
        debug: false,
      });

      // Error handling
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('[VideoPlayer] HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('[VideoPlayer] HLS network error, trying to recover...');
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('[VideoPlayer] HLS media error, trying to recover...');
              hls?.recoverMediaError();
              break;
            default:
              console.error('[VideoPlayer] HLS fatal error, cannot recover');
              hls?.destroy();
              hlsRef.current = null;
              setState((s) => ({ ...s, phase: 'error', error: `HLS fatal error: ${data.details}` }));
              break;
          }
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        console.log(`[VideoPlayer] Manifest parsed, ${data.levels.length} levels, duration: ${video.duration}`);
        setState((s) => ({ ...s, duration: video.duration || s.totalDuration }));
        // Auto-play if previously playing
        if (state.isPlaying) {
          video.play().catch((e) => console.log('[VideoPlayer] Auto-play failed:', e));
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        console.log(`[VideoPlayer] Level loaded: ${data.details.url}`);
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log('[VideoPlayer] Media attached, loading HLS source');
        hls!.loadSource(state.masterUrl!);
      });

      hls.attachMedia(video);
      hlsRef.current = hls;

      console.log('[VideoPlayer] HLS source loaded and media attached');
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      console.log('[VideoPlayer] Using native HLS (Safari)');
      video.src = state.masterUrl;
      video.addEventListener('loadedmetadata', () => {
        setState((s) => ({ ...s, duration: video.duration || s.totalDuration }));
      });
    } else {
      console.error('[VideoPlayer] HLS not supported in this browser');
      setState((s) => ({ ...s, phase: 'error', error: 'HLS not supported in this browser' }));
    }

    return () => {
      console.log('[VideoPlayer] Cleaning up HLS player');
      hls?.destroy();
      hlsRef.current = null;
    };
  }, [state.phase, state.masterUrl]);

  // ── Setup Chunk fallback player ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video || state.phase !== 'chunks' || !state.fallbackChunks?.length) {
      initializedChunkRef.current = false;
      return;
    }

    if (!initializedChunkRef.current) {
      console.log(`[VideoPlayer] Setting up chunk fallback player`);
      const firstChunk = state.fallbackChunks[0];
      if (!firstChunk?.url) {
        console.error('[VideoPlayer] No chunk URL available');
        setState((s) => ({ ...s, phase: 'error', error: 'No chunk URL available' }));
        return;
      }
      console.log(`[VideoPlayer] Loading first chunk: ${firstChunk.url}`);
      video.src = firstChunk.url;
      initializedChunkRef.current = true;
    }

    const lastChunk = state.fallbackChunks[state.fallbackChunks.length - 1];
    setState((s) => ({
      ...s,
      duration: lastChunk?.endTime ?? s.totalDuration,
    }));

    return () => {
      // Don't clear video.src here to avoid breaking playback on re-renders
    };
  }, [state.phase, state.fallbackChunks]);

  // ── Event listeners ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setState((s) => ({ ...s, currentTime: video.currentTime }));
    };
    const onPlay = () => setState((s) => ({ ...s, isPlaying: true }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onWaiting = () => setState((s) => ({ ...s, isBuffering: true }));
    const onPlaying = () => setState((s) => ({ ...s, isBuffering: false }));
    const onLoadedMetadata = () => {
      setState((s) => ({ ...s, duration: video.duration || s.duration }));
    };

    const onEnded = () => {
      setState((s) => {
        if (s.phase === 'chunks' && s.fallbackChunks && video) {
          const nextChunk = s.fallbackChunks.find(
            (c) => c.startTime > s.currentTime
          );
          if (nextChunk?.url) {
            video.src = nextChunk.url;
            video.play();
          }
        }
        return s;
      });
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  // ── Actions ──
  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;

    const clamped = Math.max(0, Math.min(time, state.duration || state.totalDuration || 0));

    if (state.phase === 'hls' && hlsRef.current) {
      video.currentTime = clamped;
    } else if (state.phase === 'chunks' && state.fallbackChunks) {
      // Find the right chunk
      const chunk = state.fallbackChunks.find(
        (c) => clamped >= c.startTime && clamped < c.endTime
      );
      if (chunk?.url) {
        // We only switch URL if it's actually a different chunk.
        // Presigned URLs contain exact query params, so direct string match might fail if URL refreshes, 
        // but we assume it's stable for the session or we check base URL without query.
        const currentBase = video.src.split('?')[0];
        const newBase = chunk.url.split('?')[0];

        if (currentBase !== newBase) {
          console.log(`[VideoPlayer] Seeking across chunks: switching src`);
          video.src = chunk.url;
          video.onloadedmetadata = () => {
            video.currentTime = clamped - chunk.startTime;
            if (state.isPlaying) {
              video.play().catch(e => console.error('[VideoPlayer] Auto-play after seek failed:', e));
            }
            video.onloadedmetadata = null; // cleanup
          };
        } else {
          video.currentTime = clamped - chunk.startTime;
        }
      }
    }

    setState((s) => ({ ...s, currentTime: clamped }));

    // Call backend API async for telemetry/logging
    seekApi(videoId, clamped).catch(err => console.error('[VideoPlayer] Seek API error:', err));
  }, [state.phase, state.duration, state.totalDuration, state.fallbackChunks, videoId]);

  const setPlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (state.isPlaying) video.pause();
    else video.play();
  }, [state.isPlaying]);

  // ✅ refresh ที่ทำงานจริง — increment counter ให้ useEffect ทำงานใหม่
  const refresh = useCallback(() => {
    setState((s) => ({
      ...s,
      phase: 'loading',
      error: null,
      currentTime: 0,
    }));
    setRefreshTrigger((t) => t + 1);
  }, []);

  return {
    videoRef,
    state,
    seek,
    setPlaybackRate,
    togglePlay,
    refresh,
  };
}