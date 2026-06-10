export type ChunkStatus = 'pending' | 'uploading' | 'uploaded' | 'processing' | 'done' | 'failed';
export type UploadPhase = 'idle' | 'splitting' | 'initiating' | 'uploading' | 'paused' | 'completed' | 'cancelled' | 'error';
export type UploadStep =
  | 'Idle'
  | 'Loading FFmpeg.wasm'
  | 'Reading source video metadata'
  | 'Writing source video into FFmpeg'
  | 'Splitting video into MP4 chunks'
  | 'Reading split chunks'
  | 'Creating upload session in case-service'
  | 'Uploading chunks to MinIO'
  | 'Refreshing backend chunk status'
  | 'Paused'
  | 'Completed'
  | 'Cancelled'
  | 'Error';

export interface ApiEnvelope<T> {
  status: string;
  message: string;
  data: T;
}

export interface InitiateUploadInput {
  caseId: string;
  filename: string;
  totalChunks: number;
  chunkDuration: number;
  mimeType?: string;
  estimatedTotalSize?: number;
}

export interface ResumeUploadInput {
  chunkIndexes: number[];
}

export interface ChunkInfo {
  chunkIndex: number;
  chunkId: string;
  startTime: number;
  endTime: number;
  s3Key: string;
  presignedUrl: string;
  expiresIn: number;
}

export interface ChunkStatusItem {
  chunkIndex: number;
  chunkId: string;
  status: Exclude<ChunkStatus, 'uploading'>;
  startTime: number;
  endTime: number;
  eTag?: string;
  metadataS3Key?: string;
  frameCount?: number;
}

export interface ChunkStatusResponse {
  videoId: string;
  totalChunks: number;
  pendingChunks: ChunkStatusItem[];
  failedChunks: ChunkStatusItem[];
  activeChunks: ChunkStatusItem[];
}

export interface LocalChunk {
  chunkIndex: number;
  chunkId: string;
  startTime: number;
  endTime: number;
  s3Key: string;
  presignedUrl: string;
  expiresIn: number;
  blob?: Blob;
  blobSize?: number;
  status: ChunkStatus;
  uploadProgress: number;
  eTag?: string;
  error?: string;
  metadataS3Key?: string;
  frameCount?: number;
}

export interface SavedSession {
  videoId: string;
  caseId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  chunkDuration: number;
  createdAt: string;
}
