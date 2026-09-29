import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CalendarModule } from '../calendar/calendar.module';
import { FilesModule } from '../files/files.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttachmentFilesController, TasksController, WorkspaceCapacityController, WorkspaceTasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [WorkspacesModule, AuditModule, FilesModule, NotificationsModule, CalendarModule],
  controllers: [WorkspaceTasksController, TasksController, AttachmentFilesController, WorkspaceCapacityController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}

