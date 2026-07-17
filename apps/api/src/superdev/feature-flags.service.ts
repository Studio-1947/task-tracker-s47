import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type Database } from '../database/database.module';
import { featureFlags, type FeatureFlagRow } from '../database/schema';

/**
 * Reads/writes global kill-switches. Values are cached in-memory with a short TTL so
 * the per-request maintenance-mode check doesn't hit Postgres on every call; writes
 * refresh the cache immediately.
 */
@Injectable()
export class FeatureFlagsService {
  private cache = new Map<string, boolean>();
  private cacheExpiry = 0;
  private static readonly TTL_MS = 5_000;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async refresh(): Promise<void> {
    const rows = await this.db.select().from(featureFlags);
    this.cache = new Map(rows.map((r) => [r.key, r.enabled]));
    this.cacheExpiry = Date.now() + FeatureFlagsService.TTL_MS;
  }

  /** Cheap cached read for hot paths (e.g. the maintenance guard). */
  async isEnabled(key: string): Promise<boolean> {
    if (Date.now() > this.cacheExpiry) await this.refresh();
    return this.cache.get(key) ?? false;
  }

  async list(): Promise<FeatureFlagRow[]> {
    const rows = await this.db.select().from(featureFlags).orderBy(featureFlags.key);
    return rows;
  }

  async set(key: string, enabled: boolean, description?: string): Promise<FeatureFlagRow> {
    const [row] = await this.db
      .insert(featureFlags)
      .values({ key, enabled, description: description ?? null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled, updatedAt: new Date(), ...(description !== undefined ? { description } : {}) },
      })
      .returning();
    // Keep the hot cache honest without waiting for TTL.
    this.cache.set(key, enabled);
    return row!;
  }
}
