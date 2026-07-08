import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createLabelSchema, type CreateLabelInput } from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LabelsService } from './labels.service';

@Controller()
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get('workspaces/:workspaceId/labels')
  list(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @CurrentUser() user: RequestUser) {
    return this.labels.list(workspaceId, user);
  }

  @Post('workspaces/:workspaceId/labels')
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body(new ZodValidationPipe(createLabelSchema)) body: CreateLabelInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.labels.create(workspaceId, user, body);
  }

  @Delete('labels/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.labels.remove(id, user);
  }
}
