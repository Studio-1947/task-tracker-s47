const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/task-tracker' });
  
  await pool.query(`UPDATE leave_types SET applicable_gender = 'FEMALE' WHERE name = 'Maternity Leave'`);
  await pool.query(`UPDATE leave_types SET applicable_gender = 'MALE' WHERE name = 'Paternity Leave'`);
  
  console.log('Fixed leave types genders');
  await pool.end();
}
run();
