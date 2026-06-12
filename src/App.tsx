import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { LocalChunk, SavedSession, VideoListItem } from './types';
import { useChunkUpload } from './useChunkUpload';
import { getVideoList } from './api';
import { FrameViewer } from './FrameViewer';
import { formatBytes, formatSeconds, percent } from './utils';

const durationOptions = [
  { label: '1 min', value: 60 },
  { label: '3 min', value: 180 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '15 min', value: 900 },
];

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress">
      <div className="progressFill" style={{ width: `${percent(value)}%` }} />
    </div>
  );
}

function SessionCard({
  session,
  onRestore,
}: {
  session: SavedSession | null;
  onRestore: (session: SavedSession) => void;
}) {
  if (!session) return null;

  return (
    <section className="band restoreBand">
      <div>
        <div className="eyebrow">Saved browser session</div>
        <strong>{session.filename}</strong>
        <div className="muted">
          videoId {session.videoId} · chunk {session.chunkDuration}s · {formatBytes(session.fileSize)}
        </div>
      </div>
      <button className="secondary" onClick={() => onRestore(session)}>
        Restore status
      </button>
    </section>
  );
}

function ChunkTable({ chunks }: { chunks: LocalChunk[] }) {
  const visible = useMemo(() => chunks.slice(0, 300), [chunks]);

  if (chunks.length === 0) {
    return <div className="empty">No chunks yet.</div>;
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Status</th>
            <th>Upload</th>
            <th>Time</th>
            <th>Size</th>
            <th>ETag / Metadata</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((chunk) => (
            <tr key={chunk.chunkIndex}>
              <td>{chunk.chunkIndex}</td>
              <td>
                <span className={`pill ${chunk.status}`}>{chunk.status}</span>
              </td>
              <td>
                <ProgressBar value={chunk.uploadProgress} />
                <span className="small">{percent(chunk.uploadProgress)}%</span>
              </td>
              <td>
                {formatSeconds(chunk.startTime)} - {formatSeconds(chunk.endTime)}
              </td>
              <td>{formatBytes(chunk.blobSize)}</td>
              <td className="mono">
                {chunk.eTag || chunk.metadataS3Key || '-'}
                {chunk.frameCount ? <span className="muted"> · {chunk.frameCount} frames</span> : null}
              </td>
              <td className="errorText">{chunk.error || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {chunks.length > visible.length ? (
        <div className="tableNote">Showing first {visible.length} chunks from {chunks.length} total.</div>
      ) : null}
    </div>
  );
}

// ── Video List Component ──
function VideoListPanel({
  videos,
  selectedId,
  onSelect,
  onRefresh,
}: {
  videos: VideoListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const statusPill = (status: string) => {
    const map: Record<string, string> = {
      pending: 'pending',
      uploading: 'uploaded',
      processing: 'processing',
      completed: 'done',
      error: 'failed',
    };
    return map[status] || 'pending';
  };

  return (
    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="sectionHeader">
        <div>
          <div className="eyebrow">Video Library</div>
          <h2>Select video to view</h2>
        </div>
        <button className="secondary" onClick={onRefresh}>
          Refresh list
        </button>
      </div>
      {videos.length === 0 ? (
        <div className="empty">No videos found. Upload one first.</div>
      ) : (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Video</th>
                <th>Status</th>
                <th>Chunks</th>
                <th>HLS</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr
                  key={v.id}
                  style={selectedId === v.id ? { background: '#e8f4f8' } : undefined}
                >
                  <td>
                    <div style={{ fontWeight: 700 }}>{v.filename || 'Untitled'}</div>
                    <div className="mono muted" style={{ fontSize: 11 }}>
                      {v.id}
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${statusPill(v.status)}`}>{v.status}</span>
                  </td>
                  <td>
                    {v.completedChunks}/{v.totalChunks}
                  </td>
                  <td>{v.hlsReady ? '✅' : '⏳'}</td>
                  <td className="muted">
                    {new Date(v.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <button
                      className={selectedId === v.id ? 'danger' : 'secondary'}
                      style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }}
                      onClick={() => onSelect(selectedId === v.id ? '' : v.id)}
                    >
                      {selectedId === v.id ? 'Close viewer' : 'View frames'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const upload = useChunkUpload();
  const [caseId, setCaseId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [concurrency, setConcurrency] = useState(3);

  // ── Video list state ──
  const [videos, setVideos] = useState<VideoListItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [listError, setListError] = useState<string | null>(null);

  const fetchVideoList = async () => {
    try {
      setListError(null);
      const data = await getVideoList();
      setVideos(data);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load video list');
    }
  };

  useEffect(() => {
    fetchVideoList();
  }, []);

  useEffect(() => {
    if (upload.caseId && !caseId) {
      setCaseId(upload.caseId);
    }
  }, [caseId, upload.caseId]);

  const canStart = Boolean(caseId && file && !['splitting', 'initiating', 'uploading'].includes(upload.phase));
  const canResume = Boolean(
    upload.videoId && !['splitting', 'initiating', 'uploading', 'idle'].includes(upload.phase)
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    upload.startUpload({
      caseId,
      file,
      chunkDuration: upload.chunkDuration,
      concurrency,
    });
  };

  const handleRestore = async (session: SavedSession) => {
    upload.attachSavedSession(session);
    setCaseId(session.caseId);
    await upload.refreshStatus(session.videoId);
  };

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>TeleCap Video Chunk Upload</h1>
          <p>React frontend for case-service upload, resume, cancel, status polling, and debug visibility.</p>
        </div>
        <div className={`phase phase-${upload.phase}`}>{upload.phase}</div>
      </header>

      <SessionCard session={upload.savedSession} onRestore={handleRestore} />

      {/* ── Video List + Frame Viewer ── */}
      <VideoListPanel
        videos={videos}
        selectedId={selectedVideoId || null}
        onSelect={(id) => setSelectedVideoId(id)}
        onRefresh={fetchVideoList}
      />

      {selectedVideoId && (
        <section
          className="panel"
          style={{
            marginBottom: 18,
            padding: 0,
            overflow: 'hidden',
            height: '70vh',
            border: '2px solid #166d86',
          }}
        >
          <div
            style={{
              padding: '8px 16px',
              background: '#166d86',
              color: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              Frame Viewer — {videos.find((v) => v.id === selectedVideoId)?.filename || selectedVideoId}
            </span>
            <button
              onClick={() => setSelectedVideoId('')}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                fontSize: 18,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ height: 'calc(70vh - 36px)' }}>
            <FrameViewer videoId={selectedVideoId} />
          </div>
        </section>
      )}

      {listError && (
        <div className="alert" style={{ marginBottom: 18 }}>
          {listError}
        </div>
      )}

      <section className="layout">
        <form className="panel controls" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="caseId">Case ID</label>
            <input
              id="caseId"
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
            />
          </div>

          <div className="field">
            <label htmlFor="video">Video file</label>
            <input
              id="video"
              type="file"
              accept="video/mp4,video/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file ? <span className="muted">{file.name} · {formatBytes(file.size)}</span> : null}
          </div>

          <div className="field">
            <label>Chunk duration</label>
            <div className="segmented">
              {durationOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={upload.chunkDuration === option.value ? 'active' : ''}
                  onClick={() => upload.setChunkDuration(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field compact">
            <label htmlFor="concurrency">Parallel uploads</label>
            <input
              id="concurrency"
              type="number"
              min={1}
              max={8}
              value={concurrency}
              onChange={(event) => setConcurrency(Number(event.target.value))}
            />
          </div>

          <div className="actions">
            <button type="submit" disabled={!canStart}>Upload video</button>
            <button type="button" className="danger" onClick={upload.cancelUpload} disabled={upload.phase !== 'uploading'}>
              Cancel video
            </button>
            <button type="button" className="secondary" onClick={upload.resetUpload}>
              Reset
            </button>
          </div>
        </form>

        <section className="panel statusPanel">
          <div className="statusHeader">
            <div>
              <div className="eyebrow">Current video</div>
              <h2>{upload.filename || 'No active upload'}</h2>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => upload.refreshStatus()}
              disabled={!upload.videoId}
            >
              Check status
            </button>
          </div>

          <div className="metrics">
            <div>
              <span>Upload chunks</span>
              <strong>{upload.stats.uploadedCount}/{upload.stats.totalChunks}</strong>
              <ProgressBar value={upload.stats.uploadProgress} />
            </div>
            <div>
              <span>Upload bytes</span>
              <strong>{percent(upload.stats.byteProgress)}%</strong>
              <ProgressBar value={upload.stats.byteProgress} />
            </div>
            <div>
              <span>Processing</span>
              <strong>{upload.stats.doneCount}/{upload.stats.totalChunks}</strong>
              <ProgressBar value={upload.stats.processingProgress} />
            </div>
            <div>
              <span>Split</span>
              <strong>{percent(upload.splitProgress)}%</strong>
              <ProgressBar value={upload.splitProgress} />
            </div>
          </div>

          <dl className="debugGrid">
            <div><dt>caseId</dt><dd className="mono">{upload.caseId || '-'}</dd></div>
            <div><dt>videoId</dt><dd className="mono">{upload.videoId || '-'}</dd></div>
            <div><dt>step</dt><dd>{upload.currentStep}</dd></div>
            <div><dt>pending</dt><dd>{upload.stats.pendingCount}</dd></div>
            <div><dt>uploading</dt><dd>{upload.stats.uploadingCount}</dd></div>
            <div><dt>failed</dt><dd>{upload.stats.failedCount}</dd></div>
            <div><dt>file size</dt><dd>{formatBytes(upload.fileSize)}</dd></div>
          </dl>

          {upload.error ? <div className="alert">{upload.error}</div> : null}
        </section>
      </section>

      <section className="band resumeBand">
        <div>
          <h2>Resume video</h2>
          <p>
            Backend can generate fresh presigned URLs for pending chunks. Select the original file again if the page was refreshed.
          </p>
        </div>
        <input
          type="file"
          accept="video/mp4,video/*"
          onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
        />
        <button
          className="secondary"
          type="button"
          disabled={!canResume}
          onClick={() => upload.resumeCurrentUpload(resumeFile ?? undefined, concurrency)}
        >
          Resume pending chunks
        </button>
      </section>

      <section className="panel">
        <div className="sectionHeader">
          <div>
            <div className="eyebrow">Chunk debug</div>
            <h2>Upload and processing details</h2>
          </div>
          <div className="legend">
            <span><i className="dot pending" />pending</span>
            <span><i className="dot uploaded" />uploaded</span>
            <span><i className="dot processing" />processing</span>
            <span><i className="dot done" />done</span>
            <span><i className="dot failed" />failed</span>
          </div>
        </div>
        <ChunkTable chunks={upload.chunks} />
      </section>

      <section className="panel eventPanel">
        <div className="sectionHeader">
          <div>
            <div className="eyebrow">Runtime log</div>
            <h2>Frontend upload events</h2>
          </div>
        </div>
        {upload.events.length === 0 ? (
          <div className="empty">No frontend events yet.</div>
        ) : (
          <ol className="eventLog">
            {upload.events.map((event, index) => (
              <li key={`${event}-${index}`} className="mono">{event}</li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}