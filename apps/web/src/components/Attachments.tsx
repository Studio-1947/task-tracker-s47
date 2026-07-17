import { useEffect, useRef, useState } from 'react';
import type { FileAttachment, LinkAttachment, TaskAttachment } from '@task-tracker/shared';
import {
  useAddLinkAttachment,
  useDeleteAttachment,
  useTaskAttachments,
  useUploadAttachment,
} from '../hooks/useTasks';
import { useAuthObjectUrl } from '../hooks/useAuthObjectUrl';
import { apiBlob, ApiRequestError } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import { useAuth } from '../stores/auth';
import { AuthImage } from './AuthImage';
import { Avatar } from './Avatar';
import { inspectLink, LinkPreview, ProviderIcon } from './LinkPreview';
import { Button, Spinner } from './ui';

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime,' +
  'text/plain,text/csv,text/markdown,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

const isFile = (a: TaskAttachment): a is FileAttachment => a.kind === 'FILE';
const isLink = (a: TaskAttachment): a is LinkAttachment => a.kind === 'LINK';
const isImage = (a: FileAttachment) => a.mimeType.startsWith('image/');
const isVideo = (a: FileAttachment) => a.mimeType.startsWith('video/');
const isPdf = (a: FileAttachment) => a.mimeType === 'application/pdf';
/** Kinds the browser can render for us — everything else is download-only. */
const canPreview = (a: FileAttachment) => isImage(a) || isPdf(a) || isVideo(a);

async function download(att: FileAttachment) {
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
  const addLink = useAddLinkAttachment(taskId, workspaceId);
  const remove = useDeleteAttachment(taskId, workspaceId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<FileAttachment | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const canDelete = (a: TaskAttachment) => isAdmin || a.uploader.id === user?.id;

  const all = attachments ?? [];
  const files = all.filter(isFile);
  const links = all.filter(isLink);
  const images = files.filter(isImage);

  const onPick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('File must be 20 MB or smaller.');
      return;
    }
    upload.mutate(file, {
      onError: (err) => setError(err instanceof ApiRequestError ? err.message : 'Upload failed'),
      onSettled: () => {
        if (fileInput.current) fileInput.current.value = '';
      },
    });
  };

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Attachments{all.length ? ` (${all.length})` : ''}
        </h3>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            aria-label="Choose file to attach"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <Button
            variant="ghost"
            className="py-1.5 px-3 text-xs"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {upload.isPending ? 'Uploading…' : '+ Add file'}
          </Button>
          <Button
            variant="ghost"
            className="py-1.5 px-3 text-xs"
            onClick={() => {
              setError(null);
              setShowLinkForm((s) => !s);
            }}
          >
            + Add link
          </Button>
        </div>
      </div>

      {showLinkForm ? (
        <AddLinkForm
          pending={addLink.isPending}
          onCancel={() => setShowLinkForm(false)}
          onSubmit={(input) => {
            setError(null);
            addLink.mutate(input, {
              onSuccess: () => setShowLinkForm(false),
              onError: (err) =>
                setError(err instanceof ApiRequestError ? err.message : 'Could not add link'),
            });
          }}
        />
      ) : null}

      {error ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {isLoading ? (
        <Spinner />
      ) : !all.length ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No attachments yet. Upload files up to 20 MB (images, PDFs and video preview inline), or paste
          a link (Figma, Docs, video…).
        </p>
      ) : (
        <div className="space-y-3">
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                  title={a.fileName}
                  onClick={() => setLightbox(a)}
                >
                  <AuthImage
                    path={`/files/${a.storageKey}`}
                    alt={a.fileName}
                    className="h-full w-full object-cover"
                    fallback={
                      <span className="flex h-full items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                        …
                      </span>
                    }
                  />
                </button>
              ))}
            </div>
          ) : null}

          {links.length > 0 ? (
            <div className="space-y-2">
              {links.map((a) => (
                <LinkCard
                  key={a.id}
                  link={a}
                  canDelete={canDelete(a)}
                  deleting={remove.isPending}
                  onDelete={() => {
                    if (window.confirm(`Remove link "${a.fileName}"?`)) remove.mutate(a.id);
                  }}
                />
              ))}
            </div>
          ) : null}

          {files.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {files.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <FileIcon mime={a.mimeType} />
                  <div className="min-w-0 flex-1">
                    {canPreview(a) ? (
                      <button
                        type="button"
                        onClick={() => setLightbox(a)}
                        title={`Preview ${a.fileName}`}
                        className="block max-w-full truncate text-left text-sm font-medium text-slate-700 hover:text-indigo-600 hover:underline dark:text-slate-200 dark:hover:text-indigo-400 cursor-pointer"
                      >
                        {a.fileName}
                      </button>
                    ) : (
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{a.fileName}</p>
                    )}
                    <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                      <Avatar user={a.uploader} size="sm" className="!h-4 !w-4 text-[8px]" />
                      {a.uploader.name} · {formatBytes(a.sizeBytes)} · {formatDateTime(a.createdAt)}
                    </p>
                  </div>
                  {canPreview(a) ? (
                    <button
                      type="button"
                      aria-label={`Preview ${a.fileName}`}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                      onClick={() => setLightbox(a)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Download ${a.fileName}`}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
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
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
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

function AddLinkForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (input: { url: string; title?: string }) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  const trimmed = url.trim();
  const info = trimmed ? inspectLink(trimmed) : null;
  // Mirrors the server rule, so bad input is caught before a round-trip.
  const valid = /^https?:\/\/.+/i.test(trimmed);

  return (
    <form
      className="mb-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-[#222222]/50"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({ url: trimmed, title: title.trim() || undefined });
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          autoFocus
          type="url"
          inputMode="url"
          aria-label="Link URL"
          placeholder="https://figma.com/design/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-[#252525] dark:text-white"
        />
        <input
          aria-label="Link label (optional)"
          placeholder="Label (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 sm:w-44 dark:border-slate-800 dark:bg-[#252525] dark:text-white"
        />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Button type="submit" className="py-1.5 px-3 text-xs" disabled={!valid || pending}>
          {pending ? 'Adding…' : 'Add link'}
        </Button>
        <Button type="button" variant="ghost" className="py-1.5 px-3 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        {trimmed && !valid ? (
          <span className="text-xs font-medium text-red-500 dark:text-red-400">
            Must start with http:// or https://
          </span>
        ) : info && info.provider !== 'generic' ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <ProviderIcon provider={info.provider} className="h-3.5 w-3.5" />
            {info.label} — preview available
          </span>
        ) : null}
      </div>
    </form>
  );
}

function LinkCard({
  link,
  canDelete,
  deleting,
  onDelete,
}: {
  link: LinkAttachment;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const { provider, embedUrl, hostname, label } = inspectLink(link.url);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#1e1e1e]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <ProviderIcon provider={provider} />
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={link.url}
            target="_blank"
            // noreferrer/noopener: the opened tab must not get a handle on this window.
            rel="noopener noreferrer nofollow"
            className="block truncate text-sm font-semibold text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
            title={link.url}
          >
            {link.fileName}
          </a>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-400 dark:text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {label}
            </span>
            {hostname} · {link.uploader.name} · {formatDateTime(link.createdAt)}
          </p>
        </div>

        {embedUrl ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30 cursor-pointer"
          >
            {expanded ? 'Hide' : 'Preview'}
          </button>
        ) : null}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={`Open ${link.fileName} in a new tab`}
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
        {canDelete ? (
          <button
            type="button"
            aria-label={`Remove link ${link.fileName}`}
            disabled={deleting}
            onClick={onDelete}
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        ) : null}
      </div>

      <LinkPreview url={link.url} expanded={expanded} />
    </div>
  );
}

function Lightbox({ attachment, onClose }: { attachment: FileAttachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4 animate-fade-in dark:bg-slate-950/90"
      onClick={onClose}
    >
      <div className="max-h-full w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <PreviewBody attachment={attachment} />
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

/**
 * Renders the actual bytes for a previewable attachment. Images go through
 * AuthImage; PDFs and video need a blob URL because their element's `src` can't
 * carry the auth header.
 */
function PreviewBody({ attachment }: { attachment: FileAttachment }) {
  const needsBlob = isPdf(attachment) || isVideo(attachment);
  const { data: blobUrl, isError } = useAuthObjectUrl(
    needsBlob ? `/files/${attachment.storageKey}` : null,
  );

  if (isImage(attachment)) {
    return (
      <AuthImage
        path={`/files/${attachment.storageKey}`}
        alt={attachment.fileName}
        className="mx-auto max-h-[85vh] max-w-full rounded-lg object-contain"
        fallback={<Spinner />}
      />
    );
  }

  if (isError) {
    return (
      <p className="rounded-lg bg-white/10 p-6 text-center text-sm text-white/80">
        Could not load this file. Try downloading it instead.
      </p>
    );
  }
  if (!blobUrl) return <Spinner />;

  if (isVideo(attachment)) {
    return <video src={blobUrl} controls className="max-h-[85vh] w-full rounded-lg" />;
  }

  // PDF: the blob is same-origin, so the browser's built-in viewer handles it.
  return <iframe src={blobUrl} title={attachment.fileName} className="h-[85vh] w-full rounded-lg bg-white" />;
}

function FileIcon({ mime }: { mime: string }) {
  const label = mime.startsWith('image/')
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
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      {label}
    </span>
  );
}
