import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  Role,
  createWorkspaceSchema,
  updateWorkspaceMembersSchema,
  updateWorkspaceSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type UpdateWorkspaceMembersInput,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(RolesGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  // Admin sees all; members see only their assigned workspaces (scoped in the service).
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.workspaces.list(user);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.workspaces.getOne(id, user);
  }

  @Get(':id/members')
  listMembers(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.workspaces.listMembers(id, user);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Body(new ZodValidationPipe(createWorkspaceSchema)) body: CreateWorkspaceInput,
    @CurrentUser('id') userId: string,
  ) {
    return this.workspaces.create(body, userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) body: UpdateWorkspaceInput,
  ) {
    return this.workspaces.update(id, body);
  }

  @Post(':id/members')
  @Roles(Role.ADMIN)
  updateMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWorkspaceMembersSchema)) body: UpdateWorkspaceMembersInput,
  ) {
    return this.workspaces.updateMembers(id, body);
  }
}
