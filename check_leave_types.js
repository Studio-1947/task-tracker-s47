const { Pool } = require('pg');
async function run() {
  const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/task-tracker' });
  const res = await pool.query('SELECT name, applicable_gender FROM leave_types');
  console.table(res.rows);
  await pool.end();
}
run();
