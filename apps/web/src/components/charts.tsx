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
const PAD = { top: 16, right: 12, bottom: 28, left: 32 };

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
  
  // Area path for gradient fill under the line chart
  const areaPath = points.length === 0 ? '' : [
    `M${x(0)},${PAD.top + innerH}`,
    ...points.map((p, i) => `L${x(i)},${y(p.completed)}`),
    `L${x(points.length - 1)},${PAD.top + innerH}`,
    'Z'
  ].join(' ');

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Tasks completed per day: ${points.map((p) => `${p.day} ${p.completed}`).join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-slate-100 dark:stroke-slate-800/60"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" className="fill-slate-400 dark:fill-slate-500 font-semibold text-[9px]">
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
            className="stroke-slate-200 dark:stroke-slate-700/60"
            strokeWidth={1.2}
            strokeDasharray="4 4"
          />
        ) : null}

        {/* Gradient fill under the line */}
        <path d={areaPath} fill="url(#chartAreaGradient)" />

        <path d={path} fill="none" className="stroke-indigo-600 dark:stroke-indigo-500" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.date}>
            <circle
              cx={x(i)}
              cy={y(p.completed)}
              r={hover === i ? 5 : 3.5}
              className="fill-indigo-600 dark:fill-indigo-500 stroke-white dark:stroke-[#0f1320] transition-all duration-150"
              strokeWidth={2}
            />
            <text
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className={`text-[9px] font-bold tracking-wide transition-all ${hover === i ? 'fill-slate-700 dark:fill-slate-200 font-extrabold' : 'fill-slate-400 dark:fill-slate-500'}`}
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
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>

      {hovered && hover !== null ? (
        <div
          className="pointer-events-none absolute z-25 -translate-x-1/2 rounded-lg bg-slate-900/95 dark:bg-slate-950/95 border border-slate-700/50 dark:border-slate-800/80 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl backdrop-blur-sm -top-6 transition-all duration-150 animate-fade-in"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <span className="text-slate-400 mr-1">{hovered.day}:</span>
          <span className="text-indigo-400 font-bold">{hovered.completed} completed</span>
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
    <div className="space-y-3.5">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-4">
          <div className="w-36 min-w-0 shrink-0 sm:w-44">{item.label}</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 dark:from-indigo-600 dark:to-violet-600 transition-all duration-300"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-bold text-slate-500 dark:text-slate-400">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
