import { useEffect, useRef, useState } from 'react';
import type { TaskAttachment } from '@task-tracker/shared';
import { useDeleteAttachment, useTaskAttachments, useUploadAttachment } from '../hooks/useTasks';
import { apiBlob, ApiRequestError } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import { useAuth } from '../stores/auth';
import { AuthImage } from './AuthImage';
import { Avatar } from './Avatar';
import { Button, Spinner } from './ui';

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime,' +
  'text/plain,text/csv,text/markdown,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

const isImage = (mime: string) => mime.startsWith('image/');

async function download(att: TaskAttachment) {
  const blob = await apiBlob(`/files/${att.storageKey}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function Attachments({ taskId, workspaceId }: { taskId: string; workspaceId: string }) {
  const { user } = useAuth();
  const { data: attachments, isLoading } = useTaskAttachments(taskId);
  const upload = useUploadAttachment(taskId, workspaceId);
  const remove = useDeleteAttachment(taskId, workspaceId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<TaskAttachment | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const canDelete = (a: TaskAttachment) => isAdmin || a.uploader.id === user?.id;
  const images = (attachments ?? []).filter((a) => isImage(a.mimeType));
  const others = (attachments ?? []).filter((a) => !isImage(a.mimeType));

  const onPick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('File must be 20 MB or smaller.');
      return;
    }
    upload.mutate(file, {
      onError: (err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Upload failed'),
      onSettled: () => {
        if (fileInput.current) fileInput.current.value = '';
      },
    });
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Attachments{attachments?.length ? ` (${attachments.length})` : ''}
        </h3>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label="Choose file to attach"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <Button variant="ghost" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
          {upload.isPending ? 'Uploading…' : '+ Add file'}
        </Button>
      </div>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      {isLoading ? (
        <Spinner />
      ) : !attachments?.length ? (
        <p className="text-sm text-slate-400">No attachments yet. Images, PDFs, videos and documents up to 20 MB.</p>
      ) : (
        <div className="space-y-3">
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                  title={a.fileName}
                  onClick={() => setLightbox(a)}
                >
                  <AuthImage
                    path={`/files/${a.storageKey}`}
                    alt={a.fileName}
                    className="h-full w-full object-cover"
                    fallback={<span className="flex h-full items-center justify-center text-xs text-slate-400">…</span>}
                  />
                </button>
              ))}
            </div>
          ) : null}

          {(images.length > 0 ? attachments : others).length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <FileIcon mime={a.mimeType} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">{a.fileName}</p>
                    <p className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Avatar user={a.uploader} size="sm" className="!h-4 !w-4 text-[8px]" />
                      {a.uploader.name} · {formatBytes(a.sizeBytes)} · {formatDateTime(a.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Download ${a.fileName}`}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => void download(a).catch(() => setError('Download failed'))}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  {canDelete(a) ? (
                    <button
                      type="button"
                      aria-label={`Delete ${a.fileName}`}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete "${a.fileName}"?`)) remove.mutate(a.id);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {lightbox ? <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} /> : null}
    </section>
  );
}

function Lightbox({ attachment, onClose }: { attachment: TaskAttachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <AuthImage
          path={`/files/${attachment.storageKey}`}
          alt={attachment.fileName}
          className="max-h-[85vh] max-w-full rounded-lg object-contain"
          fallback={<Spinner />}
        />
        <p className="mt-2 text-center text-sm text-white/80">{attachment.fileName}</p>
      </div>
      <button
        type="button"
        aria-label="Close preview"
        className="absolute right-4 top-4 rounded-md p-2 text-white/80 hover:bg-white/10"
        onClick={onClose}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function FileIcon({ mime }: { mime: string }) {
  const label = isImage(mime)
    ? 'IMG'
    : mime === 'application/pdf'
      ? 'PDF'
      : mime.startsWith('video/')
        ? 'VID'
        : mime.startsWith('text/')
          ? 'TXT'
          : mime.includes('zip')
            ? 'ZIP'
            : 'DOC';
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[9px] font-bold text-slate-500">
      {label}
    </span>
  );
}
