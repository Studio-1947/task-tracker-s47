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
    const res = await pool.query(`
      UPDATE tasks 
      SET 
        due_date = due_date + interval '13 hours 30 minutes',
        original_due_date = original_due_date + interval '13 hours 30 minutes'
      WHERE due_date IS NOT NULL 
        AND EXTRACT(HOUR FROM due_date AT TIME ZONE 'UTC') = 0 
        AND EXTRACT(MINUTE FROM due_date AT TIME ZONE 'UTC') = 0;
    `);
    console.log('Fixed', res.rowCount, 'task deadlines');
  } catch(e: any) { 
    console.error('Failed to fix deadlines', e.message); 
  }

  await pool.end();
}

main();
