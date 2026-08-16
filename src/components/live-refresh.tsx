'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Periodically re-fetches this route's server-rendered data so a queue/appointment board
 * reflects other users' actions, not just this browser's own (router.refresh() previously
 * only ever fired after a local mutation — see AppointmentActions). Pauses while the tab is
 * hidden so a background tab doesn't keep hitting the server. Short-poll rather than a
 * WebSocket/SSE channel, deliberately — the same tradeoff already made for WebRTC call
 * signaling (src/components/video/call-room.tsx), which works across multiple server
 * instances with no new infrastructure.
 */
export function LiveRefresh({ intervalMs = 12000 }: { intervalMs?: number }) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function start() {
      if (timerRef.current) return;
      timerRef.current = setInterval(() => router.refresh(), intervalMs);
    }
    function stop() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    function handleVisibility() {
      if (document.hidden) stop();
      else start();
    }

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
