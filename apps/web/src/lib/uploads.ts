/**
 * Client-side mirror of the server's upload allowlist (api/src/files/files.constants.ts).
 * The server is the authority — this exists so the picker filters sensibly and so
 * pasted/dropped files are named in a way the server will accept. Keep in step
 * with ATTACHMENT_TYPES.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** `accept` for a file input covering everything the server allows. */
export const ACCEPT_ATTACHMENT =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime,' +
  'text/plain,text/csv,text/markdown,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

/**
 * Extensions the server accepts per mime. First entry is canonical (what the
 * server stores it as). Mirrors ATTACHMENT_TYPES — a file whose extension isn't
 * listed for its mime is rejected with "This file type is not allowed".
 */
const EXTENSIONS_BY_MIME: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'text/markdown': ['md'],
  'application/zip': ['zip'],
};

export function isUploadableMime(mime: string): boolean {
  return mime in EXTENSIONS_BY_MIME;
}

/**
 * The server requires a file's extension to match its mimetype, but clipboard
 * images arrive named "image.png" — or with no usable name at all — so a pasted
 * screenshot would be rejected. Give such a file a unique, correctly-extensioned
 * name. Files that already have a valid name (a real drag-and-drop from disk) are
 * returned untouched so their original name survives.
 */
export function ensureUploadableName(file: File, stem = 'pasted'): File {
  const allowed = EXTENSIONS_BY_MIME[file.type];
  if (!allowed) return file; // Unknown type — let the server reject it with its own message.

  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const named = file.name.includes('.') && allowed.includes(ext);
  if (named) return file;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return new File([file], `${stem}-${stamp}.${allowed[0]}`, { type: file.type });
}

/**
 * Files carried by a paste/drop. Returns [] when the payload is plain text, so
 * the caller can leave normal text pasting alone.
 *
 * Copying an image out of a web page puts BOTH an image file and text/html on the
 * clipboard; taking the file is what the user means.
 */
export function filesFromTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];

  // `items` is the reliable source for clipboard payloads; `files` for drops.
  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  if (out.length === 0 && dt.files?.length) out.push(...Array.from(dt.files));

  return out;
}
