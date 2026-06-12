import { useState, useCallback, useRef, useEffect } from 'react';

export interface TimelineState {
  zoom: number;
  panOffset: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartPan: number;
}

export function useTimeline(duration: number) {
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, pan: 0 });

  const visibleDuration = duration / zoom;
  const maxPan = Math.max(0, duration - visibleDuration);

  // Clamp pan offset
  useEffect(() => {
    if (panOffset > maxPan) setPanOffset(maxPan);
    if (panOffset < 0) setPanOffset(0);
  }, [panOffset, maxPan]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, pan: panOffset };
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.current.x;
    const pxPerSecond = 1200 / visibleDuration;
    const deltaTime = deltaX / pxPerSecond;
    const newPan = Math.max(0, Math.min(maxPan, dragStart.current.pan - deltaTime));
    setPanOffset(newPan);
  }, [isDragging, visibleDuration, maxPan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(1, Math.min(64, zoom * delta));
    setZoom(newZoom);
  }, [zoom]);

  const zoomTo = useCallback((level: number) => {
    setZoom(Math.max(1, Math.min(64, level)));
  }, []);

  const timeToPx = useCallback((time: number) => {
    return ((time - panOffset) / visibleDuration) * 1200;
  }, [panOffset, visibleDuration]);

  const pxToTime = useCallback((px: number) => {
    return (px / 1200) * visibleDuration + panOffset;
  }, [panOffset, visibleDuration]);

  return {
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
  };
}
