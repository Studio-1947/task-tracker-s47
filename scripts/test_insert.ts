import { db } from '../apps/api/src/database/db.js';
import { teams, teamMembers } from '../apps/api/src/database/schema/organisation.js';
import { and, eq } from 'drizzle-orm';

async function run() {
  const personId = '0c71e4fe-54ae-4ada-afe8-95b784c74094';
  const managerId = '7a2ac603-9532-474f-932a-e682c6f374d3';

  console.log('Testing inheritManagerTeams logic...');
  const [ledTeams, membershipTeams] = await Promise.all([
    db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.managerId, managerId), eq(teams.isArchived, false))),
    db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, managerId)),
  ]);

  console.log('Led Teams:', ledTeams);
  console.log('Membership Teams:', membershipTeams);

  const teamIds = [
    ...new Set([
      ...ledTeams.map((team) => team.id),
      ...membershipTeams.map((team) => team.teamId),
    ]),
  ];

  console.log('teamIds:', teamIds);

  if (teamIds.length > 0) {
    const insertValues = [];
    for (const tId of teamIds) {
      insertValues.push({ teamId: tId, userId: personId });
    }
    console.log('Inserting...', insertValues);
    const result = await db.insert(teamMembers).values(insertValues).onConflictDoNothing();
    console.log('Insert result:', result);
  }
}

run().then(() => process.exit(0)).catch(console.error);
