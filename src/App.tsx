import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { LocalChunk, SavedSession } from './types';
import { useChunkUpload } from './useChunkUpload';
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

export default function App() {
  const upload = useChunkUpload();
  const [caseId, setCaseId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [concurrency, setConcurrency] = useState(3);

  useEffect(() => {
    if (upload.caseId && !caseId) {
      setCaseId(upload.caseId);
    }
  }, [caseId, upload.caseId]);

  const canStart = Boolean(caseId && file && !['splitting', 'initiating', 'uploading'].includes(upload.phase));
  // ✅ เปิด resume จากทุก state ที่ไม่ใช่กำลังทำงานอยู่
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