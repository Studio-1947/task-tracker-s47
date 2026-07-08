import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { CreateLabelInput, LabelRef } from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { labels } from '../database/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type Actor = { id: string; role: string };

@Injectable()
export class LabelsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workspaces: WorkspacesService,
  ) {}

  async list(workspaceId: string, actor: Actor): Promise<LabelRef[]> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    return this.db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.workspaceId, workspaceId))
      .orderBy(asc(labels.name));
  }

  async create(workspaceId: string, actor: Actor, input: CreateLabelInput): Promise<LabelRef> {
    await this.workspaces.assertCanAccess(workspaceId, actor);
    const [row] = await this.db
      .insert(labels)
      .values({ workspaceId, name: input.name, color: input.color ?? null })
      .returning({ id: labels.id, name: labels.name, color: labels.color });
    return row!;
  }

  async remove(labelId: string, actor: Actor): Promise<{ id: string }> {
    const [label] = await this.db
      .select({ id: labels.id, workspaceId: labels.workspaceId })
      .from(labels)
      .where(eq(labels.id, labelId))
      .limit(1);
    if (!label) throw new NotFoundException('Label not found');
    await this.workspaces.assertCanAccess(label.workspaceId, actor);
    // taskLabels rows cascade-delete via FK.
    await this.db.delete(labels).where(eq(labels.id, labelId));
    return { id: labelId };
  }
}
