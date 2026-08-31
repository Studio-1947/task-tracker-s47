import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Role,
  createBoardItemSchema,
  createBoardNoteSchema,
  reorderBoardItemsSchema,
  setMoodSchema,
  updateBoardItemSchema,
  updateBoardNoteSchema,
  updateMeetingBoardSchema,
  type CreateBoardItemInput,
  type CreateBoardNoteInput,
  type ReorderBoardItemsInput,
  type SetMoodInput,
  type UpdateBoardItemInput,
  type UpdateBoardNoteInput,
  type UpdateMeetingBoardInput,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MeetingsService } from './meetings.service';

/**
 * Weekly meeting mood board. The whole team can read every week (that's the
 * point of the board); write access is scoped per-user in the service.
 */
@Controller('meeting-boards')
@UseGuards(RolesGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  /* ── board ── */

  /** Recent weeks for the switcher. Declared before `:id` routes to avoid shadowing. */
  @Get('weeks')
  weeks(@Query('limit') limit?: string) {
    const n = Number.parseInt(limit ?? '', 10);
    return this.meetings.listWeeks(Number.isFinite(n) ? n : 12);
  }

  /**
   * Projects the caller may file a card under. Declared before `:id` routes for
   * the same reason as `weeks` — a literal segment must win over the param.
   */
  @Get('projects')
  projectOptions(@CurrentUser() user: RequestUser) {
    return this.meetings.listProjectOptions(user);
  }

  /** The board for the week containing `date` (defaults to today). Created on first open. */
  @Get()
  board(@CurrentUser() user: RequestUser, @Query('date') date?: string) {
    return this.meetings.getOrCreateBoard(user, date);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  updateBoard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMeetingBoardSchema)) body: UpdateMeetingBoardInput,
  ) {
    return this.meetings.updateBoard(id, body);
  }

  /* ── cards ── */

  @Post(':id/items')
  createItem(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createBoardItemSchema)) body: CreateBoardItemInput,
  ) {
    return this.meetings.createItem(user, id, body);
  }

  @Post(':id/reorder')
  reorder(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reorderBoardItemsSchema)) body: ReorderBoardItemsInput,
  ) {
    return this.meetings.reorderItems(user, id, body);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateBoardItemSchema)) body: UpdateBoardItemInput,
  ) {
    return this.meetings.updateItem(user, itemId, body);
  }

  @Delete('items/:itemId')
  deleteItem(@CurrentUser() user: RequestUser, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.meetings.deleteItem(user, itemId);
  }

  /* ── mood ── */

  @Put(':id/mood')
  setMood(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setMoodSchema)) body: SetMoodInput,
  ) {
    return this.meetings.setMood(user, id, body);
  }

  /* ── notes & comments ── */

  /** Comments on one card (board-level notes ship inside the board payload). */
  @Get('items/:itemId/notes')
  itemNotes(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.meetings.listItemNotes(itemId);
  }

  @Post(':id/notes')
  createNote(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createBoardNoteSchema)) body: CreateBoardNoteInput,
  ) {
    return this.meetings.createNote(user, id, body);
  }

  @Patch('notes/:noteId')
  updateNote(
    @CurrentUser() user: RequestUser,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body(new ZodValidationPipe(updateBoardNoteSchema)) body: UpdateBoardNoteInput,
  ) {
    return this.meetings.updateNote(user, noteId, body);
  }

  @Delete('notes/:noteId')
  deleteNote(@CurrentUser() user: RequestUser, @Param('noteId', ParseUUIDPipe) noteId: string) {
    return this.meetings.deleteNote(user, noteId);
  }
}
