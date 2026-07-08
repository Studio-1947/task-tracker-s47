import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/**
 * Runtime migrator used in production (compiled to dist and run before the server
 * boots — see the API Dockerfile). Uses drizzle-orm's migrator (a prod dependency),
 * so drizzle-kit is not needed in the runtime image.
 */
async function main(): Promise<void> {
  // Load a .env if one is present (local/compose); in prod env vars are injected.
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const { config } = await import('dotenv');
    config({ path: envPath });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  // Migrations folder lives next to the compiled output (apps/api/drizzle).
  const migrationsFolder = resolve(__dirname, '../../drizzle');

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  try {
    console.log('Running migrations from', migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log('✓ Migrations up to date');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
