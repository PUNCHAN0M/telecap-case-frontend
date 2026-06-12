import React from 'react';

interface PlayerControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (rate: number) => void;
  onFullscreen?: () => void;
}

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  playbackRate,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onFullscreen,
}) => {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const speeds = [0.5, 1, 1.5, 2, 4, 8];

  return (
    <div
      className="player-controls"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: '#111',
        borderTop: '1px solid #222',
        color: '#fff',
      }}
    >
      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          fontSize: '22px',
          cursor: 'pointer',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
        }}
      >
        {isBuffering ? '⏳' : isPlaying ? '⏸️' : '▶️'}
      </button>

      {/* Time display */}
      <div
        style={{
          fontFamily: '"SF Mono", Consolas, monospace',
          fontSize: '13px',
          color: '#ccc',
          minWidth: '160px',
        }}
      >
        <span style={{ color: '#fff' }}>{formatTime(currentTime)}</span>
        <span style={{ color: '#666', margin: '0 4px' }}>/</span>
        <span style={{ color: '#888' }}>{formatTime(duration)}</span>
      </div>

      {/* Progress bar */}
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{
            width: '100%',
            height: '20px',
            cursor: 'pointer',
            WebkitAppearance: 'none',
            appearance: 'none',
            background: 'transparent',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '4px',
            background: '#333',
            borderRadius: '2px',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: '#ff4444',
              borderRadius: '2px',
              transition: 'width 0.1s linear',
            }}
          />
        </div>
      </div>

      {/* Speed controls */}
      <div style={{ display: 'flex', gap: '3px' }}>
        {speeds.map((rate) => (
          <button
            key={rate}
            onClick={() => onSpeedChange(rate)}
            style={{
              background: playbackRate === rate ? '#ff4444' : '#2a2a2a',
              border: 'none',
              color: playbackRate === rate ? '#fff' : '#888',
              padding: '3px 8px',
              borderRadius: '3px',
              fontSize: '11px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {rate}x
          </button>
        ))}
      </div>

      {/* Fullscreen */}
      {onFullscreen && (
        <button
          onClick={onFullscreen}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          ⛶
        </button>
      )}
    </div>
  );
};
