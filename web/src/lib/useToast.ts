import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Toast hook used by both the commander and reservist dashboards.
 *
 * Stores the latest message in `toast`, exposes `showToast(msg)` to set it,
 * and auto-clears after `durationMs` (default 2000). Successive calls
 * cancel the previous clear-timer so a fresh toast that lands within the
 * timeout window isn't cleared by its predecessor (the original code-smell
 * fixed in PR #59 / #61).
 *
 * Unmount also clears the timer so a teardown mid-flight doesn't leak.
 */
export function useToast(durationMs = 2000): {
  toast: string | null;
  showToast: (msg: string) => void;
} {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(msg);
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, durationMs);
  }, [durationMs]);

  return { toast, showToast };
}
