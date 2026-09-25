import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingReportsService } from './meeting-reports.service';

/**
 * Cards filed under a project are mirrored as real workspace tasks, so the board
 * leans on the tasks and workspaces layers rather than writing those tables itself.
 */
@Module({
  imports: [TasksModule, WorkspacesModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingReportsService],
})
export class MeetingsModule {}
