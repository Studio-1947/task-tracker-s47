import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
import { AVATAR_MAX_BYTES } from '../files/files.constants';
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

  // Workspace logo — admin only. Validated (image-only allowlist) in FilesService.save.
  @Post(':id/logo')
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES } }),
  )
  uploadLogo(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file provided');
    return this.workspaces.setLogo(id, file);
  }

  @Delete(':id/logo')
  @Roles(Role.ADMIN)
  removeLogo(@Param('id', ParseUUIDPipe) id: string) {
    return this.workspaces.removeLogo(id);
  }
}
