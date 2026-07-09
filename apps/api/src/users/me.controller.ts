import {
  BadRequestException,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AVATAR_MAX_BYTES } from '../files/files.constants';
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
}
