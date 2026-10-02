const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://tasktracker:change-me-in-prod@localhost:5432/task_tracker',
  });
  await client.connect();

  const users = await client.query('SELECT id, name, reports_to_id FROM users WHERE name ILIKE \'%checkout timer%\' OR name ILIKE \'%Final Flow%\'');
  console.log('Users:');
  console.table(users.rows);

  const checkoutManagerId = users.rows.find(u => u.name.includes('Checkout Timer S'))?.id;

  if (checkoutManagerId) {
    const teams = await client.query('SELECT * FROM teams WHERE manager_id = $1', [checkoutManagerId]);
    console.log('Led Teams:');
    console.table(teams.rows);

    const members = await client.query('SELECT tm.*, t.name FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = $1', [checkoutManagerId]);
    console.log('Membership Teams:');
    console.table(members.rows);
  }

  const allMembers = await client.query('SELECT tm.user_id, tm.team_id, u.name, t.name as team_name FROM team_members tm JOIN users u ON u.id = tm.user_id JOIN teams t ON t.id = tm.team_id');
  console.log('All Memberships:');
  console.table(allMembers.rows.filter(r => r.name.includes('Checkout') || r.name.includes('Final Flow')));

  await client.end();
}
run().catch(console.error);
