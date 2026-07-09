import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AttachmentFilesController, TasksController, WorkspaceTasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [WorkspacesModule, AuditModule, FilesModule],
  controllers: [WorkspaceTasksController, TasksController, AttachmentFilesController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
