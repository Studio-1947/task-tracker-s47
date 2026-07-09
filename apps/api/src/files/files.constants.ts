/**
 * Upload allowlists. A file is accepted only when its mimetype AND its
 * client-filename extension both belong to the SAME entry — the stored
 * extension always comes from here, never from the client.
 */
export interface AllowedType {
  mime: string;
  /** First entry is the canonical stored extension. */
  extensions: string[];
}

export const AVATAR_TYPES: AllowedType[] = [
  // No SVG: it can carry scripts (stored-XSS vector).
  { mime: 'image/png', extensions: ['png'] },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  { mime: 'image/webp', extensions: ['webp'] },
  { mime: 'image/gif', extensions: ['gif'] },
];

export const ATTACHMENT_TYPES: AllowedType[] = [
  ...AVATAR_TYPES,
  { mime: 'application/pdf', extensions: ['pdf'] },
  { mime: 'video/mp4', extensions: ['mp4'] },
  { mime: 'video/webm', extensions: ['webm'] },
  { mime: 'video/quicktime', extensions: ['mov'] },
  { mime: 'text/plain', extensions: ['txt'] },
  { mime: 'text/csv', extensions: ['csv'] },
  { mime: 'text/markdown', extensions: ['md'] },
  { mime: 'application/zip', extensions: ['zip'] },
  { mime: 'application/msword', extensions: ['doc'] },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'] },
  { mime: 'application/vnd.ms-excel', extensions: ['xls'] },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['xlsx'] },
  { mime: 'application/vnd.ms-powerpoint', extensions: ['ppt'] },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensions: ['pptx'] },
];

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/** Mimes the browser may render inline; everything else downloads as an attachment. */
export const INLINE_MIMES = new Set([...AVATAR_TYPES.map((t) => t.mime), 'application/pdf']);

export type FileKind = 'avatars' | 'attachments';
