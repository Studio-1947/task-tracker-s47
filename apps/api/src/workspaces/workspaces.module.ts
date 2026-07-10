import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FilesModule } from '../files/files.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [UsersModule, FilesModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
