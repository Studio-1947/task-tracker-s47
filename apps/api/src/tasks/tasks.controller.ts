import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createCommentSchema,
  createTaskSchema,
  taskQuerySchema,
  updateTaskSchema,
  type CreateCommentInput,
  type CreateTaskInput,
  type TaskQuery,
  type UpdateTaskInput,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
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
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.archive(id, user);
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
}
