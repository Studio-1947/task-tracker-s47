import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/ui';

/**
 * The scrollable, zoomable, drag-to-pan canvas shared by the People chart and the Teams chart.
 * Children render inside `.orgchart`, so they only supply the nested `<ul><li>` tree.
 * Uses the CSS `zoom` property (not transform) so the scroll size follows the zoom level.
 */
export function ChartFrame({
  heading,
  extraControls,
  ready,
  scrollKey,
  children,
}: {
  heading: ReactNode;
  extraControls?: ReactNode;
  /** True once there is something to fit; the first view is fitted then centred on "you". */
  ready: boolean;
  /** Changes when a search hit should be scrolled into view. */
  scrollKey: string;
  children: ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);

  // `floor` keeps the first view readable; the Fit button passes a lower floor to show everything.
  const fit = (floor = 0.3) => {
    const w = wrap.current; const i = inner.current;
    if (!w || !i) return;
    setZoom(1);
    requestAnimationFrame(() => {
      const z = Math.max(floor, Math.min(1, (w.clientWidth - 24) / i.scrollWidth));
      setZoom(Number(z.toFixed(2)));
    });
  };

  useEffect(() => {
    if (fitted.current || !ready) return;
    fitted.current = true;
    fit(0.6);
    const t = setTimeout(() => wrap.current?.querySelector('[data-node-me="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!scrollKey) return;
    const t = setTimeout(() => wrap.current?.querySelector('[data-node-hit="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }), 120);
    return () => clearTimeout(t);
  }, [scrollKey]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-node],button,input,select,a')) return;
    const w = wrap.current; if (!w) return;
    drag.current = { x: e.clientX, y: e.clientY, l: w.scrollLeft, t: w.scrollTop };
    w.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; const w = wrap.current;
    if (!d || !w) return;
    w.scrollLeft = d.l - (e.clientX - d.x);
    w.scrollTop = d.t - (e.clientY - d.y);
  };
  const endDrag = () => { drag.current = null; };
  const step = (delta: number) => setZoom((z) => Number(Math.max(0.3, Math.min(1.5, z + delta)).toFixed(2)));

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {heading}
        <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="Zoom">
          {extraControls}
          <Button variant="ghost" className="px-2.5 py-1 text-sm" onClick={() => step(-0.1)} aria-label="Zoom out">−</Button>
          <span className="w-11 text-center tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" className="px-2.5 py-1 text-sm" onClick={() => step(0.1)} aria-label="Zoom in">+</Button>
          <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => fit()}>Fit</Button>
          <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setZoom(1)}>100%</Button>
        </div>
      </div>
      <div
        ref={wrap}
        data-chart-scroll
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative max-h-[72vh] cursor-grab overflow-auto rounded-xl border border-slate-200 bg-[radial-gradient(circle,rgba(148,163,184,.25)_1px,transparent_1px)] [background-size:18px_18px] p-4 active:cursor-grabbing dark:border-slate-700"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div ref={inner} className="orgchart mx-auto w-max" style={{ zoom }}>
          {children}
        </div>
      </div>
    </div>
  );
}
