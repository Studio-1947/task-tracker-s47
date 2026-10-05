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
        email NOT LIKE 'outside_%' 
        AND email NOT LIKE 'queue_%' 
        AND email NOT LIKE 'plain_%' 
        AND email NOT LIKE 'metrics_%'
        AND email NOT LIKE 'payroll_%'
        AND email NOT LIKE '%smoke%'
        AND email NOT LIKE 'bot_%'
      ORDER BY name;
    `);
    console.table(res.rows);
  } catch(e: any) { 
    console.error('Failed to query users', e.message); 
  }

  await pool.end();
}

main();
