import React from 'react';

interface ErrorOverlayProps {
  error: string;
  onRetry: () => void;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({ error, onRetry }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#fff',
        gap: '12px',
      }}
    >
      <div style={{ fontSize: '48px' }}>⚠️</div>
      <div style={{ fontSize: '18px', fontWeight: 600, color: '#ff4444' }}>Error</div>
      <div style={{ fontSize: '13px', color: '#888', maxWidth: '400px', textAlign: 'center' }}>
        {error}
      </div>
      <button
        onClick={onRetry}
        style={{
          background: '#ff4444',
          border: 'none',
          color: '#fff',
          padding: '8px 24px',
          borderRadius: '6px',
          fontSize: '13px',
          cursor: 'pointer',
          marginTop: '8px',
        }}
      >
        Retry
      </button>
    </div>
  );
};
