const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/task_tracker' });

async function seed() {
  try {
    const ws = await pool.query("INSERT INTO workspaces (id, name, is_archived) VALUES (gen_random_uuid(), 'UAT Demo Workspace', false) RETURNING id");
    const wsId = ws.rows[0].id;
    const admin = await pool.query("SELECT id FROM users LIMIT 1");
    if (admin.rowCount > 0) {
      await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MANAGER')", [wsId, admin.rows[0].id]);
    }
    console.log('Created workspace ' + wsId);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
seed();
