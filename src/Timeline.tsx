import React, { useRef, useEffect, useCallback } from 'react';
import { useTimeline } from './useTimeline';
import type { TimelineMarker } from './types';

interface TimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  markers?: TimelineMarker[];
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 100;
const TRACK_TOP = 30;
const TRACK_HEIGHT = 50;

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  onSeek,
  markers,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    zoom,
    panOffset,
    visibleDuration,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    zoomTo,
    timeToPx,
    pxToTime,
  } = useTimeline(duration);

  // ── Render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf: number;

    const render = () => {
      const w = CANVAS_WIDTH;
      const h = CANVAS_HEIGHT;
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, w, h);

      // Track background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, TRACK_TOP, w, TRACK_HEIGHT);

      // Hour markers
      const hourInterval = 3600;
      const startHour = Math.floor(panOffset / hourInterval) * hourInterval;

      for (let t = startHour; t < panOffset + visibleDuration; t += hourInterval) {
        const x = timeToPx(t);
        if (x < -50 || x > w + 50) continue;

        // Major grid line
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 15);
        ctx.lineTo(x, h - 10);
        ctx.stroke();

        // Hour label
        ctx.fillStyle = '#999';
        ctx.font = '11px "SF Mono", Consolas, monospace';
        const hours = Math.floor(t / 3600);
        const mins = Math.floor((t % 3600) / 60);
        ctx.fillText(`${hours}:${mins.toString().padStart(2, '0')}`, x + 3, 12);
      }

      // 10-minute markers (minor)
      const tenMinInterval = 600;
      const startTenMin = Math.floor(panOffset / tenMinInterval) * tenMinInterval;
      for (let t = startTenMin; t < panOffset + visibleDuration; t += tenMinInterval) {
        if (t % hourInterval === 0) continue;
        const x = timeToPx(t);
        if (x < -10 || x > w + 10) continue;

        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, TRACK_TOP + 5);
        ctx.lineTo(x, TRACK_TOP + TRACK_HEIGHT - 5);
        ctx.stroke();
      }

      // Markers
      if (markers) {
        for (const marker of markers) {
          const mx = timeToPx(marker.time);
          if (mx >= -5 && mx <= w + 5) {
            ctx.fillStyle = marker.color || '#ffcc00';
            ctx.beginPath();
            ctx.arc(mx, TRACK_TOP + TRACK_HEIGHT / 2, 4, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // Playhead
      const playheadX = timeToPx(currentTime);
      if (playheadX >= -5 && playheadX <= w + 5) {
        // Line
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, h);
        ctx.stroke();

        // Triangle head
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.moveTo(playheadX - 6, 0);
        ctx.lineTo(playheadX + 6, 0);
        ctx.lineTo(playheadX, 8);
        ctx.fill();

        // Time tooltip
        const h2 = Math.floor(currentTime / 3600);
        const m2 = Math.floor((currentTime % 3600) / 60);
        const s2 = Math.floor(currentTime % 60);
        const timeStr = `${h2}:${m2.toString().padStart(2, '0')}:${s2.toString().padStart(2, '0')}`;

        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 12px "SF Mono", monospace';
        ctx.fillText(timeStr, playheadX + 8, 22);
      }

      // Current viewport indicator (bottom)
      const vpStart = timeToPx(0);
      const vpEnd = timeToPx(duration);
      ctx.fillStyle = 'rgba(255, 68, 68, 0.15)';
      ctx.fillRect(Math.max(0, vpStart), h - 4, Math.min(w, vpEnd) - Math.max(0, vpStart), 4);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [currentTime, panOffset, visibleDuration, timeToPx, duration, markers]);

  // ── Click to seek ──
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scaleX = CANVAS_WIDTH / rect.width;
    const canvasX = x * scaleX;
    const time = pxToTime(canvasX);
    onSeek(Math.max(0, Math.min(time, duration)));
  }, [isDragging, pxToTime, onSeek, duration]);

  // ── Zoom levels ──
  const zoomLevels = [1, 2, 4, 8, 16, 32, 64];
  const formatVisible = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  return (
    <div
      className="timeline"
      style={{ background: '#080808', borderTop: '1px solid #222' }}
    >
      {/* Zoom controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 12px',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <span style={{ color: '#666', fontSize: '11px', marginRight: '4px' }}>Zoom:</span>
        {zoomLevels.map((z) => (
          <button
            key={z}
            onClick={() => zoomTo(z)}
            style={{
              background: zoom === z ? '#ff4444' : '#2a2a2a',
              border: 'none',
              color: zoom === z ? '#fff' : '#888',
              padding: '2px 8px',
              borderRadius: '3px',
              fontSize: '11px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {z}x
          </button>
        ))}
        <span style={{ color: '#555', fontSize: '11px', marginLeft: '8px' }}>
          {formatVisible(visibleDuration)} visible
        </span>
        <span style={{ color: '#555', fontSize: '11px', marginLeft: 'auto' }}>
          Click to seek · Drag to pan · Scroll to zoom
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{ overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'pointer' }}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            width: '100%',
            height: `${CANVAS_HEIGHT}px`,
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};
