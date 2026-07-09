import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProjectsService } from './projects.service';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('workspaces/:workspaceId/projects')
  list(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @CurrentUser() user: RequestUser) {
    return this.projects.list(workspaceId, user);
  }

  @Post('workspaces/:workspaceId/projects')
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projects.create(workspaceId, user, body);
  }

  @Get('projects/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.projects.getOne(id, user);
  }

  @Patch('projects/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projects.update(id, user, body);
  }
}
