import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { TasksController, WorkspaceTasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [WorkspacesModule, AuditModule],
  controllers: [WorkspaceTasksController, TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
