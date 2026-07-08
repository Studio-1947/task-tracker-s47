import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { users } from './schema';

// Standalone seed — run with `pnpm db:seed` after migrations.
// Load the repo-root .env regardless of where the script is launched from.
for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../../.env'),
]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const admins = [
    {
      email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase(),
      password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
      name: process.env.SEED_ADMIN_NAME ?? 'Admin',
      envVar: 'SEED_ADMIN_PASSWORD',
    },
    {
      email: (process.env.SEED_ADMIN2_EMAIL ?? 'admin2@example.com').toLowerCase(),
      password: process.env.SEED_ADMIN2_PASSWORD ?? 'admin2_12345',
      name: process.env.SEED_ADMIN2_NAME ?? 'Admin 2',
      envVar: 'SEED_ADMIN2_PASSWORD',
    },
  ];

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    for (const admin of admins) {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, admin.email)).limit(1);
      if (existing) {
        console.log(`✓ Admin ${admin.email} already exists — nothing to do.`);
        continue;
      }

      const passwordHash = await argon2.hash(admin.password, { type: argon2.argon2id });
      await db.insert(users).values({
        name: admin.name,
        email: admin.email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        mustChangePassword: false,
      });
      console.log(`✓ Seeded admin: ${admin.email} (password from ${admin.envVar})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
