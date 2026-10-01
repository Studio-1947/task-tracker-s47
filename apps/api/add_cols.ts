import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    await pool.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" varchar(32) DEFAULT 'UNSPECIFIED' NOT NULL;`);
    console.log('Added users.gender');
  } catch(e) { console.error('Failed to add users.gender', e.message); }

  try {
    await pool.query(`ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "applicable_gender" varchar(32) DEFAULT 'ALL' NOT NULL;`);
    console.log('Added leave_types.applicable_gender');
  } catch(e) { console.error('Failed to add leave_types.applicable_gender', e.message); }

  await pool.end();
}

main();
