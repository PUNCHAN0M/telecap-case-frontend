import axios from 'axios';
import type {
  ApiEnvelope,
  ChunkInfo,
  ChunkStatusResponse,
  InitiateUploadInput,
  ResumeUploadInput,
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

export { isNetworkError };