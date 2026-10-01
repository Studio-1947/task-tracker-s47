const { Client } = require('pg');
require('dotenv').config({ path: '../../.env' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();
  
  await client.query(`UPDATE "leave_types" SET "applicable_gender" = 'FEMALE' WHERE "name" = 'Maternity Leave';`);
  await client.query(`UPDATE "leave_types" SET "applicable_gender" = 'MALE' WHERE "name" = 'Paternity Leave';`);
  
  console.log('Updated genders in db');
  await client.end();
}

main().catch(console.error);
