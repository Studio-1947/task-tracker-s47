import { db } from '../apps/api/src/database/db.js';
import { users, teams, teamMembers } from '../apps/api/src/database/schema/organisation.js';
import { eq } from 'drizzle-orm';

async function run() {
  const allUsers = await db.select().from(users);
  const allTeams = await db.select().from(teams);
  const allMembers = await db.select().from(teamMembers);
  
  console.log('Total users:', allUsers.length);
  console.log('Total teams:', allTeams.length);
  console.log('Total teamMembers:', allMembers.length);
  
  const checkoutManager = allUsers.find(u => u.name.includes('Checkout Timer S'));
  console.log('Checkout Manager:', checkoutManager);
  
  if (checkoutManager) {
    const managerTeams = allTeams.filter(t => t.managerId === checkoutManager.id);
    console.log('Led teams by Checkout Manager:', managerTeams);
    
    const reports = allUsers.filter(u => u.reportsToId === checkoutManager.id);
    console.log('Reports to Checkout Manager:', reports);
    
    for (const report of reports) {
      const reportTeams = allMembers.filter(tm => tm.userId === report.id);
      console.log(`Report ${report.name} is in teams:`, reportTeams);
    }
  }
}
run().then(() => process.exit(0)).catch(console.error);
