import { useEffect, useRef, useCallback } from 'react';

/** Idle timeout: 30 minutes in milliseconds */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'mousemove',
  'mousedown',
  'touchstart',
  'keydown',
  'scroll',
];

/**
 * Hook that monitors user activity and triggers a callback
 * after 30 minutes of inactivity.
 */
export function useIdleTimer(onIdle: () => void, enabled: boolean = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onIdle);

  // Keep callback ref current
  useEffect(() => {
    callbackRef.current = onIdle;
  }, [onIdle]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      callbackRef.current();
    }, IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Start the timer
    resetTimer();

    // Reset on any user activity
    const handleActivity = () => resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
    };
  }, [enabled, resetTimer]);
}
