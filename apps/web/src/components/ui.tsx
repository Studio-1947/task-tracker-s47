import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 hover:shadow-md hover:shadow-indigo-500/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
    ghost: 'bg-white/80 dark:bg-[#1e1e1e]/80 border border-slate-200 dark:border-[#2d2d2d] text-slate-700 dark:text-[#d4d4d8] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] hover:shadow-sm active:scale-[0.99]',
    danger: 'bg-white dark:bg-[#1e1e1e] border border-red-200 dark:border-red-950/60 text-red-600 dark:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20 active:scale-[0.99]',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm outline-none transition-all duration-150 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20 ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/30 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.03)] dark:border-[#2d2d2d] dark:from-[#1e1e1e] dark:to-[#181818] dark:shadow-none ${className}`}>{children}</div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-450 dark:text-slate-500">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600 dark:border-[#2d2d2d] dark:border-t-indigo-500" />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818] dark:border-[#2a2a2a] px-6 py-16 text-center">
      {icon ? <div className="mb-3.5 text-slate-300 dark:text-slate-600">{icon}</div> : null}
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-350">{title}</p>
      {hint ? <p className="mt-1.5 max-w-sm text-sm text-slate-400 dark:text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Small colored label chip. */
export function LabelChip({ name, color }: { name: string; color?: string | null }) {
  const c = color ?? '#64748b';
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      style={{ backgroundColor: `${c}12`, color: c, border: `1px solid ${c}25` }}
    >
      {name}
    </span>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/30 px-4 py-3.5 text-sm text-red-650 dark:border-red-950/30 dark:bg-red-950/20 dark:text-red-400">{message}</div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' }) {
  const tones = {
    slate: 'bg-slate-100/80 text-slate-600 dark:bg-[#252525] dark:text-[#d4d4d8] border border-slate-200/50 dark:border-[#333333]',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-450 border border-emerald-100/50 dark:border-emerald-900/30',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-450 border border-amber-100/50 dark:border-amber-900/30',
  }[tone];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${tones}`}>{children}</span>;
}
