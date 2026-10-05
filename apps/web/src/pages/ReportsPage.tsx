import { useState } from 'react';
import { apiBlob, ApiRequestError } from '../lib/api';
import { Card } from '../components/ui';
import { useWorkspaces } from '../hooks/useWorkspaces';

export function ReportsPage() {
  return (
    <div className="mt-6 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white">Reports</h1>
      <p className="text-slate-500 dark:text-slate-400">
        Download executive analyses, full task activity data, and weekly operational drafts.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlyReportDownloads />
        <OperationalDraftReportsCard />
      </div>
    </div>
  );
}

function MonthlyReportDownloads() {
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(nowMonth);
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (format: 'pdf' | 'csv') => {
    setDownloading(format);
    setError(null);
    try {
      const blob = await apiBlob(`/admin/reports/monthly.${format}?month=${month}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `task-tracker-report-${month}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not download the report');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
          Monthly reporting
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Download an executive analysis or the full task activity data.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span className="mb-1 block">Report month</span>
          <input
            type="month"
            value={month}
            max={nowMonth}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white"
          />
        </label>
        <button
          type="button"
          disabled={!month || downloading !== null}
          onClick={() => void download('pdf')}
          className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {downloading === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
        </button>
        <button
          type="button"
          disabled={!month || downloading !== null}
          onClick={() => void download('csv')}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-slate-200 dark:hover:bg-[#252525]"
        >
          {downloading === 'csv' ? 'Preparing CSV...' : 'Download CSV'}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-full">{error}</p>
      ) : null}
    </Card>
  );
}

function OperationalDraftReportsCard() {
  const { data: workspaces } = useWorkspaces();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [reportType, setReportType] = useState<'wednesday' | 'friday' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeWorkspaces = workspaces?.filter((w) => !w.isArchived) ?? [];

  const handleDownload = async () => {
    if (!selectedWorkspaceId || !reportType) return;
    setDownloading(true);
    setError(null);
    try {
      const qs = `workspaceId=${selectedWorkspaceId}&type=${reportType}`;
      const blob = await apiBlob(`/admin/reports/operational?${qs}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `operational-report-${reportType}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not generate report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between bg-gradient-to-br from-white to-slate-50/50 dark:from-[#1e1e1e] dark:to-[#181818]">
      <div className="flex-1">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">
          Weekly Operational Reports
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Draft PDFs showing current status and blockers.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="mb-1 block">Workspace</span>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white min-w-[200px]"
            >
              <option value="">Select workspace...</option>
              {activeWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className="mb-1 block">Report</span>
            <select
              value={reportType ?? ''}
              onChange={(e) => setReportType(e.target.value as 'wednesday' | 'friday')}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white min-w-[150px]"
            >
              <option value="">Select...</option>
              <option value="wednesday">Wednesday Draft</option>
              <option value="friday">Friday Summary</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <button
          type="button"
          disabled={!selectedWorkspaceId || !reportType || downloading}
          onClick={() => void handleDownload()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
        >
          {downloading ? 'Preparing...' : 'Download PDF'}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-full">{error}</p>
      ) : null}
    </Card>
  );
}
