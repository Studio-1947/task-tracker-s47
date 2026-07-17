import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gte, lt } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';
import { errorLogs, type ErrorLogRow } from '../database/schema';

export interface RecordErrorInput {
  level?: string;
  statusCode?: number;
  method?: string | null;
  path?: string | null;
  message: string;
  stack?: string | null;
  userId?: string | null;
  meta?: unknown;
}

/**
 * Persists and queries the server error journal. Recording is best-effort and never
 * throws — a failure to log an error must not turn into a second error.
 */
@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger('ErrorLog');

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async record(input: RecordErrorInput): Promise<void> {
    try {
      await this.db.insert(errorLogs).values({
        level: input.level ?? 'error',
        statusCode: input.statusCode ?? null,
        method: input.method ?? null,
        path: input.path ? input.path.slice(0, 500) : null,
        message: input.message.slice(0, 10_000),
        stack: input.stack ?? null,
        userId: input.userId ?? null,
        meta: (input.meta as object) ?? null,
      });
    } catch (err) {
      this.logger.warn(`Failed to persist error log: ${(err as Error).message}`);
    }
  }

  async list(opts: { page?: number; pageSize?: number; resolved?: boolean } = {}): Promise<{
    items: ErrorLogRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const where = opts.resolved === undefined ? undefined : eq(errorLogs.resolved, opts.resolved);

    const items = await this.db
      .select()
      .from(errorLogs)
      .where(where)
      .orderBy(desc(errorLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(errorLogs)
      .where(where);

    return { items, total: Number(total), page, pageSize };
  }

  async setResolved(id: string, resolved: boolean): Promise<void> {
    await this.db.update(errorLogs).set({ resolved }).where(eq(errorLogs.id, id));
  }

  /** Count errors in the trailing window (default 24h) — for the overview tile. */
  async countSince(since: Date): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(errorLogs)
      .where(gte(errorLogs.createdAt, since));
    return Number(value);
  }

  async unresolvedCount(): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(errorLogs)
      .where(eq(errorLogs.resolved, false));
    return Number(value);
  }

  /** Housekeeping helper: drop resolved errors older than the cutoff. */
  async purgeResolvedBefore(cutoff: Date): Promise<void> {
    await this.db.delete(errorLogs).where(and(eq(errorLogs.resolved, true), lt(errorLogs.createdAt, cutoff)));
  }
}
