import React, { useState, useCallback, useRef } from 'react';
import { useVideoPlayer } from './useVideoPlayer';
import { Timeline } from './Timeline';
import { PlayerControls } from './PlayerControls';
import { ProcessingOverlay } from './ProcessingOverlay';
import { NotAvailableOverlay } from './NotAvailableOverlay';
import { ErrorOverlay } from './ErrorOverlay';

interface FrameViewerProps {
  videoId: string;
}

export const FrameViewer: React.FC<FrameViewerProps> = ({ videoId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { videoRef, state, seek, setPlaybackRate, togglePlay, refresh } = useVideoPlayer(videoId);
  const [playbackRate, setLocalRate] = useState(1);

  const handleSpeedChange = useCallback((rate: number) => {
    setLocalRate(rate);
    setPlaybackRate(rate);
  }, [setPlaybackRate]);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  const duration = state.duration || state.totalDuration || 0;

  return (
    <div
      ref={containerRef}
      className="frame-viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#000',
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Video Area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          background: '#000',
          cursor: (state.phase === 'hls' || state.phase === 'chunks') ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (state.phase === 'hls' || state.phase === 'chunks') {
            togglePlay();
          }
        }}
      >
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
          controls={false}
          playsInline
          preload="metadata"
        />

        {/* Big Play Button Overlay when Paused */}
        {(state.phase === 'hls' || state.phase === 'chunks') && !state.isPlaying && !state.isBuffering && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              backgroundColor: 'rgba(255, 68, 68, 0.9)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}>
              <span style={{ color: 'white', fontSize: '40px', marginLeft: '6px' }}>▶</span>
            </div>
          </div>
        )}

        {/* Repackaging Progress Indicator */}
        {state.isRepackaging && (state.phase === 'chunks' || state.phase === 'processing') && (
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '12px 16px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '13px',
            border: '1px solid #333',
            pointerEvents: 'none',
            minWidth: '250px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ animation: 'spin 2s linear infinite' }}>⏳</span>
                <span style={{ fontWeight: 500 }}>กำลังปรับปรุงคุณภาพวิดีโอ...</span>
              </div>
              {typeof state.repackageProgress === 'number' && (
                <span style={{ fontWeight: 'bold', color: '#4ade80' }}>{state.repackageProgress}%</span>
              )}
            </div>
            
            {/* Progress Bar */}
            {typeof state.repackageProgress === 'number' && (
              <div style={{ width: '100%', height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${state.repackageProgress}%`, 
                  backgroundColor: '#4ade80',
                  transition: 'width 0.5s ease-out'
                }} />
              </div>
            )}
            
            {state.phase === 'chunks' && (
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                (คุณสามารถเริ่มรับชมวิดีโอล่วงหน้าได้เลย)
              </div>
            )}
          </div>
        )}

        {/* Overlays */}
        {state.phase === 'loading' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
              <div style={{ color: '#888', fontSize: '14px' }}>Loading video...</div>
            </div>
          </div>
        )}

        {state.phase === 'processing' && (
          <ProcessingOverlay videoId={videoId} onRefresh={refresh} />
        )}

        {state.phase === 'not_available' && (
          <NotAvailableOverlay message={state.error || 'Video is not available'} />
        )}

        {state.phase === 'error' && (
          <ErrorOverlay error={state.error || 'Unknown error'} onRetry={refresh} />
        )}
      </div>

      {/* Timeline */}
      {(state.phase === 'hls' || state.phase === 'chunks') && (
        <Timeline
          duration={duration}
          currentTime={state.currentTime}
          onSeek={seek}
        />
      )}

      {/* Controls */}
      {(state.phase === 'hls' || state.phase === 'chunks') && (
        <PlayerControls
          isPlaying={state.isPlaying}
          isBuffering={state.isBuffering}
          currentTime={state.currentTime}
          duration={duration}
          playbackRate={playbackRate}
          onPlayPause={togglePlay}
          onSeek={seek}
          onSpeedChange={handleSpeedChange}
          onFullscreen={handleFullscreen}
        />
      )}
    </div>
  );
};
