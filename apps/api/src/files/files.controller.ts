import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { FilesService } from './files.service';

/**
 * Serves uploaded files through the API so the global JwtAuthGuard applies —
 * uploads are never publicly reachable. (Attachment serving, which additionally
 * checks workspace access, lives in tasks; see TaskAttachmentFilesController.)
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('avatars/:name')
  async avatar(@Param('name') name: string, @Res({ passthrough: true }) res: Response) {
    const key = `avatars/${name}`;
    const path = this.files.resolvePath(key);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException('File not found');

    res.setHeader('Content-Type', this.files.mimeFor(key));
    res.setHeader('Content-Length', info.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', 'inline');
    return new StreamableFile(createReadStream(path));
  }
}
