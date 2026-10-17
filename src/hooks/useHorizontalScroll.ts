import React, { useCallback, useRef } from 'react';

export interface UseHorizontalScrollOptions {
  /**
   * If true, enables click-and-drag horizontal scrolling on desktop.
   * Defaults to true.
   */
  enableDrag?: boolean;
}

/**
 * Reusable utility function to handle mouse-wheel vertical scrolling (deltaY)
 * and map it smoothly to horizontal scrolling on scrollable containers.
 */
export const handleHorizontalWheel = (e: React.WheelEvent<HTMLElement>) => {
  if (e.deltaY !== 0) {
    e.currentTarget.scrollLeft += e.deltaY;
  }
};

/**
 * Reusable React hook that equips any horizontal container (tabs, tables, pills)
 * with mouse-wheel horizontal scrolling and smooth click-and-drag desktop scrolling.
 */
export function useHorizontalScroll<T extends HTMLElement = HTMLDivElement>(
  options: UseHorizontalScrollOptions = {}
) {
  const { enableDrag = true } = options;
  const isDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const isDraggingRef = useRef(false);

  const onWheel = useCallback((e: React.WheelEvent<T>) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<T>) => {
      if (!enableDrag || e.button !== 0) return;
      isDownRef.current = true;
      isDraggingRef.current = false;
      startXRef.current = e.pageX - e.currentTarget.offsetLeft;
      scrollLeftRef.current = e.currentTarget.scrollLeft;
    },
    [enableDrag]
  );

  const onMouseLeave = useCallback(() => {
    if (!enableDrag) return;
    isDownRef.current = false;
    isDraggingRef.current = false;
  }, [enableDrag]);

  const onMouseUp = useCallback(() => {
    if (!enableDrag) return;
    isDownRef.current = false;
    // Keep isDraggingRef active for a tick so onClickCapture can stop accidental click
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 50);
  }, [enableDrag]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<T>) => {
      if (!enableDrag || !isDownRef.current) return;
      const x = e.pageX - e.currentTarget.offsetLeft;
      const walk = x - startXRef.current;
      if (Math.abs(walk) > 4) {
        isDraggingRef.current = true;
        e.currentTarget.scrollLeft = scrollLeftRef.current - walk;
      }
    },
    [enableDrag]
  );

  const onClickCapture = useCallback(
    (e: React.MouseEvent<T>) => {
      if (enableDrag && isDraggingRef.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    [enableDrag]
  );

  const scrollProps = {
    onWheel,
    ...(enableDrag
      ? {
          onMouseDown,
          onMouseLeave,
          onMouseUp,
          onMouseMove,
          onClickCapture,
        }
      : {}),
  };

  return {
    scrollProps,
    handleWheel: onWheel,
    onWheel,
    onMouseDown,
    onMouseLeave,
    onMouseUp,
    onMouseMove,
    onClickCapture,
  };
}
