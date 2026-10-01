import {
  BadRequestException,
  Controller,
  Delete,
  Patch,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AVATAR_MAX_BYTES } from '../files/files.constants';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { updateMeSchema, type UpdateMeInput } from '@task-tracker/shared';
import { UsersService } from './users.service';

/** Self-service profile endpoints — any authenticated user, no RolesGuard. */
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES } }),
  )
  uploadAvatar(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser('id') userId: string) {
    if (!file) throw new BadRequestException('No file provided');
    return this.users.setAvatar(userId, file);
  }

  @Delete('avatar')
  removeAvatar(@CurrentUser('id') userId: string) {
    return this.users.removeAvatar(userId);
  }

  @Patch()
  updateMe(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeInput,
  ) {
    return this.users.update(userId, body, userId);
  }
}
