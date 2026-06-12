import axios from 'axios';
import type {
  ApiEnvelope,
  ChunkInfo,
  ChunkStatusResponse,
  HlsStatusResponse,
  InitiateUploadInput,
  ResumeUploadInput,
  SeekResponse,
  VideoListItem,
} from './types';

const baseURL = import.meta.env.VITE_CASE_SERVICE_URL ?? 'http://localhost:3000';

export const caseApi = axios.create({
  baseURL,
  timeout: 30_000,
});

// ✅ ตรวจจับ network error ให้ชัดเจน
function isNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return !error.response || error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED';
}

const unwrap = <T>(response: { data: ApiEnvelope<T> }): T => response.data.data;

// ── Upload APIs (existing) ──

export async function initiateUpload(input: InitiateUploadInput) {
  return unwrap(
    await caseApi.post<
      ApiEnvelope<{
        videoId: string;
        caseId: string;
        totalChunks: number;
        chunks: ChunkInfo[];
      }>
    >('/video/initiate', input),
  );
}

export async function getChunkStatus(videoId: string) {
  return unwrap(
    await caseApi.get<ApiEnvelope<ChunkStatusResponse>>(`/video/${videoId}/chunks/status`),
  );
}

export async function resumeUpload(videoId: string, input: ResumeUploadInput) {
  return unwrap(
    await caseApi.post<ApiEnvelope<{ chunks: ChunkInfo[] }>>(
      `/video/${videoId}/chunks/resume`,
      input,
    ),
  );
}

// ── Video List API (new) ──

export async function getVideoList(): Promise<VideoListItem[]> {
  const res = await caseApi.get<ApiEnvelope<VideoListItem[]>>('/video/list');
  return unwrap(res);
}

// ── Frame Viewer APIs (new) ──

export async function getHlsStatus(videoId: string): Promise<HlsStatusResponse> {
  const res = await caseApi.get<ApiEnvelope<HlsStatusResponse>>(`/video/${videoId}/hls/status`);
  return unwrap(res);
}

export async function triggerRepackage(videoId: string): Promise<{ queued: boolean }> {
  const res = await caseApi.post<ApiEnvelope<{ queued: boolean }>>(`/video/${videoId}/hls/repackage`);
  return unwrap(res);
}

export async function seek(videoId: string, time: number): Promise<SeekResponse> {
  const res = await caseApi.get<ApiEnvelope<SeekResponse>>(`/video/${videoId}/seek`, {
    params: { time },
  });
  return unwrap(res);
}

export { isNetworkError };