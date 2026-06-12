import { useEffect, useRef, useCallback } from 'react';

export function usePolling(
  callback: () => Promise<void> | void,
  intervalMs: number,
  enabled: boolean,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (enabledRef.current) {
        callbackRef.current();
      }
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
