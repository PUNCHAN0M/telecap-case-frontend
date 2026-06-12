import React from 'react';

interface NotAvailableOverlayProps {
  message: string;
}

export const NotAvailableOverlay: React.FC<NotAvailableOverlayProps> = ({ message }) => {
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
      <div style={{ fontSize: '48px' }}>⏳</div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>Video Not Ready</div>
      <div style={{ fontSize: '13px', color: '#888', maxWidth: '400px', textAlign: 'center' }}>
        {message || 'Video is still being processed. Please check back later.'}
      </div>
    </div>
  );
};
