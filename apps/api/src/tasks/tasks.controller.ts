import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import {
  createCommentSchema,
  createLinkAttachmentSchema,
  createSubtaskSchema,
  createTaskSchema,
  taskQuerySchema,
  updateTaskSchema,
  type CreateCommentInput,
  type CreateLinkAttachmentInput,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type TaskQuery,
  type UpdateTaskInput,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ATTACHMENT_MAX_BYTES, INLINE_MIMES } from '../files/files.constants';
import { FilesService } from '../files/files.service';
import { TasksService } from './tasks.service';

/** Workspace-scoped: create + list (the shared query layer for all views). */
@Controller('workspaces/:workspaceId/tasks')
export class WorkspaceTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query(new ZodValidationPipe(taskQuerySchema)) query: TaskQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasks.list(workspaceId, user, query);
  }

  @Post()
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasks.create(workspaceId, user, body);
  }
}

/** Task-scoped operations. */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.getOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasks.update(id, user, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.remove(id, user);
  }

  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.archive(id, user);
  }

  @Post(':id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.restore(id, user);
  }

  @Post(':id/subtasks')
  createSubtask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createSubtaskSchema)) body: CreateSubtaskInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasks.createSubtask(id, user, body);
  }

  @Get(':id/comments')
  listComments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.listComments(id, user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasks.addComment(id, user, body.body);
  }

  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.history(id, user);
  }

  @Get(':id/attachments')
  listAttachments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.listAttachments(id, user);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: ATTACHMENT_MAX_BYTES } }),
  )
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.tasks.addAttachment(id, user, file);
  }

  /** Attach an external link (Figma, Docs, …) rather than uploading bytes. */
  @Post(':id/attachments/links')
  addLinkAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createLinkAttachmentSchema)) body: CreateLinkAttachmentInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasks.addLinkAttachment(id, user, body);
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasks.removeAttachment(id, attachmentId, user);
  }
}

/**
 * Serves attachment bytes with per-task authorization (the requester must have
 * access to the attachment's workspace). Lives here rather than FilesController
 * because the authz check needs the tasks domain.
 */
@Controller('files')
export class AttachmentFilesController {
  constructor(
    private readonly tasks: TasksService,
    private readonly files: FilesService,
  ) {}

  @Get('attachments/:name')
  async serve(
    @Param('name') name: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = `attachments/${name}`;
    const attachment = await this.tasks.attachmentByStorageKey(key, user);
    const path = this.files.resolvePath(key);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException('File not found');

    // Original filename is client-supplied — strip anything header-hostile.
    const safeName = attachment.fileName.replace(/[^\w.\- ]+/g, '_');
    const disposition = INLINE_MIMES.has(attachment.mimeType)
      ? 'inline'
      : `attachment; filename="${safeName}"`;
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', info.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', disposition);
    return new StreamableFile(createReadStream(path));
  }
}
