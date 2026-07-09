import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  Role,
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from '@task-tracker/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN) // Entire controller is admin-only (PRD §2 / §6).
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput) {
    return this.users.create(body);
  }

  // ── Session routes (static path segments MUST come before :id params) ──

  @Get('sessions')
  listSessions() {
    return this.users.listSessions();
  }

  @Delete('sessions/:id')
  revokeSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.revokeSession(id);
  }

  // ── Parameterized user routes ──

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.users.update(id, body);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.resetPassword(id);
  }
}
