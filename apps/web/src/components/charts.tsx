import { useState, type ReactNode } from 'react';
import type { WeeklyCompletionPoint } from '@task-tracker/shared';

/** "Nice" axis max so gridlines land on round numbers. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (max <= m * pow) return m * pow;
  }
  return 10 * pow;
}

const W = 560;
const H = 170;
const PAD = { top: 12, right: 12, bottom: 24, left: 28 };

/**
 * Single-series weekly line chart (Mon–Sun), hand-rolled SVG in the app's
 * indigo-on-slate idiom. Hover shows a crosshair + value tooltip.
 */
export function LineChart({ points }: { points: WeeklyCompletionPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const yMax = niceMax(Math.max(...points.map((p) => p.completed)));
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const ticks = [0, yMax / 2, yMax];
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.completed)}`).join(' ');
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Tasks completed per day: ${points.map((p) => `${p.day} ${p.completed}`).join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-slate-200"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
              {t}
            </text>
          </g>
        ))}

        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            className="stroke-slate-300"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        <path d={path} fill="none" className="stroke-indigo-600" strokeWidth={2} strokeLinejoin="round" />

        {points.map((p, i) => (
          <g key={p.date}>
            <circle
              cx={x(i)}
              cy={y(p.completed)}
              r={hover === i ? 4.5 : 3}
              className="fill-indigo-600 stroke-white"
              strokeWidth={1.5}
            />
            <text
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className={`text-[10px] ${hover === i ? 'fill-slate-600 font-medium' : 'fill-slate-400'}`}
            >
              {p.day}
            </text>
            {/* Oversized invisible hit target per point. */}
            <rect
              x={x(i) - innerW / points.length / 2}
              y={0}
              width={innerW / points.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>

      {hovered && hover !== null ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md bg-slate-800 px-2 py-1 text-xs text-white shadow"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          {hovered.day} · {hovered.completed} completed
        </div>
      ) : null}
    </div>
  );
}

/**
 * Horizontal bar list (label | track | value) — generalization of the
 * StatusBreakdown row pattern. Values are direct-labeled.
 */
export function HBarList({ items }: { items: { key: string; label: ReactNode; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <div className="w-36 min-w-0 shrink-0 sm:w-44">{item.label}</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm text-slate-500">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
