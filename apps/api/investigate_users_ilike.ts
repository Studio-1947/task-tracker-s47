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
      SELECT id, name, email, role, is_active 
      FROM users 
      WHERE 
        name ILIKE '%rabi%' OR 
        name ILIKE '%dipam%' OR 
        name ILIKE '%tabi%' OR 
        name ILIKE '%nikhil%' OR 
        name ILIKE '%soumic%' OR 
        email ILIKE '%santtamk%'
    `);
    console.table(res.rows);
  } catch(e: any) { 
    console.error('Failed to query users', e.message); 
  }

  await pool.end();
}

main();
