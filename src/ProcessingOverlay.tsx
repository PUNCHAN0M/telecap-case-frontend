import React, { useState, useEffect } from 'react';
import { triggerRepackage } from './api';

interface ProcessingOverlayProps {
  videoId: string;
  onRefresh: () => void;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  videoId,
  onRefresh,
}) => {
  const [dots, setDots] = useState('');
  const [isTriggering, setIsTriggering] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async () => {
    setIsTriggering(true);
    try {
      await triggerRepackage(videoId);
      setTimeout(onRefresh, 2000); // Refresh after 2s
    } catch (err) {
      console.error('Trigger repackage failed:', err);
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        color: '#fff',
        zIndex: 10,
        gap: '16px',
      }}
    >
      <div style={{ fontSize: '48px' }}>🎬</div>
      <div style={{ fontSize: '18px', fontWeight: 600 }}>
        HLS Repackaging in Progress{dots}
      </div>
      <div style={{ fontSize: '13px', color: '#888', maxWidth: '400px', textAlign: 'center' }}>
        Video is being converted to streaming format for smooth playback.
        This may take a few minutes for long videos.
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <button
          onClick={handleTrigger}
          disabled={isTriggering}
          style={{
            background: '#ff4444',
            border: 'none',
            color: '#fff',
            padding: '8px 20px',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: isTriggering ? 'not-allowed' : 'pointer',
            opacity: isTriggering ? 0.6 : 1,
          }}
        >
          {isTriggering ? 'Triggering...' : 'Force Repackage'}
        </button>
        <button
          onClick={onRefresh}
          style={{
            background: '#2a2a2a',
            border: '1px solid #444',
            color: '#ccc',
            padding: '8px 20px',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
};
