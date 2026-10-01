import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './src/database/schema';
import { leaveTypes } from './src/database/schema';

for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  await db.update(leaveTypes).set({ applicableGender: 'FEMALE' }).where(eq(leaveTypes.name, 'Maternity Leave'));
  await db.update(leaveTypes).set({ applicableGender: 'MALE' }).where(eq(leaveTypes.name, 'Paternity Leave'));

  console.log('Fixed leave types genders via Drizzle');
  await pool.end();
}

main().catch(console.error);
