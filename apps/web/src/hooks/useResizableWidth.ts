import { useCallback, useEffect, useRef, useState } from 'react';

/** Tracks a CSS media query. Used to keep drawer resizing to pointer-sized screens. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** How much of the viewport a right-hand drawer must always leave uncovered. */
const VIEWPORT_MARGIN = 64;

/**
 * Width of a resizable right-hand drawer, remembered per `storageKey`.
 *
 * The panel is anchored to the right edge, so dragging its left border maps to
 * `viewportWidth - pointerX`. The value is clamped on every read — including
 * after the browser window itself is resized — so a width saved on a wide
 * monitor can never leave the drawer wider than the screen it is reopened on.
 */
export function useResizableWidth(
  storageKey: string,
  { initial, min, wide }: { initial: number; min: number; wide: number },
) {
  const clamp = useCallback(
    (value: number) => {
      const ceiling = Math.max(min, window.innerWidth - VIEWPORT_MARGIN);
      return Math.min(Math.max(Math.round(value), min), ceiling);
    },
    [min],
  );

  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return initial;
    const saved = Number(window.localStorage.getItem(storageKey));
    const ceiling = Math.max(min, window.innerWidth - VIEWPORT_MARGIN);
    return Math.min(Math.max(Number.isFinite(saved) && saved > 0 ? saved : initial, min), ceiling);
  });
  const [resizing, setResizing] = useState(false);

  // Read by the pointerup handler, which is registered once per drag and so
  // would otherwise close over the width as it was when the drag started.
  const widthRef = useRef(width);
  widthRef.current = width;

  const persist = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(storageKey, String(value));
      } catch {
        // A browser refusing storage is not a reason to break the drag.
      }
    },
    [storageKey],
  );

  const apply = useCallback(
    (value: number) => {
      const next = clamp(value);
      setWidth(next);
      persist(next);
    },
    [clamp, persist],
  );

  // Shrinking the window must not leave the drawer wider than the viewport.
  useEffect(() => {
    const onResize = () => setWidth((w) => clamp(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setResizing(true);
      // Without these the drag selects text across the page and the cursor
      // flickers back to whatever it is over as the pointer leaves the handle.
      const { userSelect, cursor } = document.body.style;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const onMove = (ev: PointerEvent) => setWidth(clamp(window.innerWidth - ev.clientX));
      const onUp = () => {
        setResizing(false);
        document.body.style.userSelect = userSelect;
        document.body.style.cursor = cursor;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        persist(widthRef.current);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [clamp, persist],
  );

  /** Snaps between the comfortable default and a wide working width. */
  const isWide = width >= wide - 1;
  const toggleWide = useCallback(() => apply(isWide ? initial : wide), [apply, initial, isWide, wide]);

  /** Arrow keys on the handle, so the drawer is resizable without a pointer. */
  const nudge = useCallback((delta: number) => apply(widthRef.current + delta), [apply]);

  return { width, resizing, startResize, toggleWide, isWide, nudge };
}
