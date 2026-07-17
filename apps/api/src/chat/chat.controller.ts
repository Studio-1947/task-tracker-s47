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
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  addMembersSchema,
  createDirectSchema,
  createGroupSchema,
  editMessageSchema,
  markReadSchema,
  sendMessageSchema,
  type AddMembersInput,
  type CreateDirectInput,
  type CreateGroupInput,
  type EditMessageInput,
  type MarkReadInput,
  type SendMessageInput,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ATTACHMENT_MAX_BYTES, INLINE_MIMES } from '../files/files.constants';
import { FilesService } from '../files/files.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
    private readonly files: FilesService,
  ) {}

  @Get('conversations')
  listConversations(@CurrentUser() user: RequestUser) {
    return this.chat.listConversations(user);
  }

  @Get('conversations/:id')
  getConversation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.chat.getConversationDetail(user, id);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chat.listMessages(user, id, {
      before,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('conversations/direct')
  async createDirect(
    @Body(new ZodValidationPipe(createDirectSchema)) body: CreateDirectInput,
    @CurrentUser() user: RequestUser,
  ) {
    const { summary, created, memberIds } = await this.chat.getOrCreateDirect(user, body.userId);
    if (created) await this.gateway.notifyConversationCreated(memberIds, summary.id);
    return summary;
  }

  @Post('conversations/group')
  async createGroup(
    @Body(new ZodValidationPipe(createGroupSchema)) body: CreateGroupInput,
    @CurrentUser() user: RequestUser,
  ) {
    const { summary, memberIds } = await this.chat.createGroup(user, body);
    await this.gateway.notifyConversationCreated(memberIds, summary.id);
    return summary;
  }

  @Post('projects/:projectId/conversation')
  async ensureProjectConversation(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const summary = await this.chat.ensureProjectConversation(user, projectId);
    this.gateway.joinUserToConversation(user.id, summary.id);
    return summary;
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @CurrentUser() user: RequestUser,
  ) {
    const message = await this.chat.sendMessage(user, id, body);
    this.gateway.broadcastNewMessage(message);
    return message;
  }

  @Patch('messages/:id')
  async editMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editMessageSchema)) body: EditMessageInput,
    @CurrentUser() user: RequestUser,
  ) {
    const message = await this.chat.editMessage(user, id, body.body);
    this.gateway.broadcastUpdatedMessage(message);
    return message;
  }

  @Delete('messages/:id')
  async deleteMessage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    const { conversationId } = await this.chat.deleteMessage(user, id);
    this.gateway.broadcastDeletedMessage(conversationId, id);
    return { conversationId, messageId: id };
  }

  @Post('messages/:id/react')
  async toggleReaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('emoji') emoji: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!emoji || typeof emoji !== 'string') {
      throw new BadRequestException('Emoji is required');
    }
    const message = await this.chat.toggleReaction(user, id, emoji);
    this.gateway.broadcastUpdatedMessage(message);
    return message;
  }

  @Post('conversations/:id/read')
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(markReadSchema)) body: MarkReadInput,
    @CurrentUser() user: RequestUser,
  ) {
    const { lastReadAt } = await this.chat.markRead(user, id, body.messageId);
    this.gateway.broadcastRead(id, user.id, lastReadAt);
    return { lastReadAt };
  }

  @Post('conversations/:id/members')
  async addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addMembersSchema)) body: AddMembersInput,
    @CurrentUser() user: RequestUser,
  ) {
    const added = await this.chat.addMembers(user, id, body.memberIds);
    await this.gateway.notifyConversationCreated(added, id);
    return this.chat.getConversationDetail(user, id);
  }

  @Delete('conversations/:id/members/:userId')
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.chat.removeMember(user, id, userId);
    this.gateway.removeUserFromConversation(userId, id);
    return { ok: true };
  }

  @Get('contacts')
  listContacts(@Query('q') q: string | undefined, @CurrentUser() user: RequestUser) {
    return this.chat.listContacts(user, q);
  }

  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: ATTACHMENT_MAX_BYTES } }),
  )
  async uploadAttachment(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file provided');
    const saved = await this.files.save('attachments', file);
    return {
      fileKey: saved.key,
      fileName: file.originalname.slice(0, 255),
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
    };
  }

  @Get('attachments/:name')
  async serveAttachment(
    @Param('name') name: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = `attachments/${name}`;
    const meta = await this.chat.attachmentForDownload(user, key);
    const path = this.files.resolvePath(key);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException('File not found');

    const safeName = meta.fileName.replace(/[^\w.\- ]+/g, '_');
    const disposition = INLINE_MIMES.has(meta.mimeType) ? 'inline' : `attachment; filename="${safeName}"`;
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', info.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', disposition);
    return new StreamableFile(createReadStream(path));
  }
}
