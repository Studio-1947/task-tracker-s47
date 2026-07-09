import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import {
  ATTACHMENT_TYPES,
  AVATAR_TYPES,
  type AllowedType,
  type FileKind,
} from './files.constants';

/** Storage keys look like "avatars/<uuid>.png" — this regex is the single traversal gate. */
const KEY_PATTERN = /^(avatars|attachments)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/;

export interface SavedFile {
  key: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly baseDir: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseDir = resolve(process.cwd(), config.get('UPLOAD_DIR', { infer: true }));
  }

  async onModuleInit(): Promise<void> {
    await mkdir(resolve(this.baseDir, 'avatars'), { recursive: true });
    await mkdir(resolve(this.baseDir, 'attachments'), { recursive: true });
  }

  private allowlist(kind: FileKind): AllowedType[] {
    return kind === 'avatars' ? AVATAR_TYPES : ATTACHMENT_TYPES;
  }

  /**
   * Validate against the kind's allowlist and persist under a server-generated
   * random key. Extension and mimetype must agree — a ".exe" renamed ".png"
   * (mismatched mimetype) is rejected before anything touches disk.
   */
  async save(kind: FileKind, file: Express.Multer.File): Promise<SavedFile> {
    const clientExt = (file.originalname.split('.').pop() ?? '').toLowerCase();
    const entry = this.allowlist(kind).find((t) => t.mime === file.mimetype);
    if (!entry || !entry.extensions.includes(clientExt)) {
      throw new BadRequestException('This file type is not allowed');
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }

    // Canonical extension comes from the allowlist, never the client filename.
    const key = `${kind}/${randomUUID()}.${entry.extensions[0]}`;
    await writeFile(resolve(this.baseDir, key), file.buffer, { flag: 'wx' });
    return { key, mimeType: entry.mime, sizeBytes: file.buffer.length };
  }

  /** Delete a stored file; tolerates already-missing files. */
  async remove(key: string): Promise<void> {
    if (!KEY_PATTERN.test(key)) return;
    try {
      await unlink(resolve(this.baseDir, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  /** Validate a storage key and return its absolute path. */
  resolvePath(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new NotFoundException('File not found');
    return resolve(this.baseDir, key);
  }

  /** Content-Type for a stored key, derived from its (server-assigned) extension. */
  mimeFor(key: string): string {
    const ext = key.split('.').pop() ?? '';
    const entry = ATTACHMENT_TYPES.find((t) => t.extensions.includes(ext));
    return entry?.mime ?? 'application/octet-stream';
  }
}
