import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { officeSchema, namedOrganisationUnitSchema, updateTeamSchema, movePersonSchema, createOrgPersonSchema, teamMembersSchema, workspaceTeamsSchema } from '@task-tracker/shared';
import { Roles } from '../common/decorators/roles.decorator'; import { RolesGuard } from '../common/guards/roles.guard'; import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'; import { Role } from '@task-tracker/shared';
import { OrganisationService } from './organisation.service';
@Controller('organisation') @UseGuards(RolesGuard) @Roles(Role.ADMIN)
export class OrganisationController { constructor(private readonly service: OrganisationService) {}
 @Get(':kind') list(@Param('kind') kind:'offices'|'clients'|'teams') { return this.service.list(kind); }
 @Post('offices') office(@Body(new ZodValidationPipe(officeSchema)) body:any) { return this.service.create('offices',body); }
 @Post('clients') client(@Body(new ZodValidationPipe(namedOrganisationUnitSchema)) body:any) { return this.service.create('clients',body); }
 @Post('teams') team(@Body(new ZodValidationPipe(namedOrganisationUnitSchema)) body:any) { return this.service.create('teams',body); }
 @Patch('teams/:id') updateTeam(@Param('id',ParseUUIDPipe) id:string,@Body(new ZodValidationPipe(updateTeamSchema)) body:any) { return this.service.updateTeam(id,body); }
 @Put('teams/:id/members') members(@Param('id',ParseUUIDPipe) id:string,@Body(new ZodValidationPipe(teamMembersSchema)) body:any) { return this.service.setTeamMembers(id,body.userIds); }
 @Get('teams/:id/members') teamMembers(@Param('id',ParseUUIDPipe) id:string) { return this.service.teamMemberIds(id); }
 @Put('workspaces/:id/teams') workspaceTeams(@Param('id',ParseUUIDPipe) id:string,@Body(new ZodValidationPipe(workspaceTeamsSchema)) body:any) { return this.service.setWorkspaceTeams(id,body.teamIds); }
 @Get('workspaces/:id/teams') getWorkspaceTeams(@Param('id',ParseUUIDPipe) id:string) { return this.service.workspaceTeamIds(id); }
}

/** The org chart is readable by every signed-in person; only the admin controller above can change it. */
@Controller('org-tree')
export class OrgTreeController {
  constructor(private readonly service: OrganisationService) {}
  @Get() tree(@CurrentUser() user: RequestUser) { return this.service.tree(user); }

  /** Admin: anyone. Manager: only people below them. The service decides; the screen just mirrors it. */
  @Patch('people/:id') movePerson(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(movePersonSchema)) body: any) { return this.service.movePerson(user, id, body); }
  @Delete('people/:id') removeFromChart(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.removeFromChart(user, id); }
  @Post('people') createPerson(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createOrgPersonSchema)) body: any) { return this.service.createPerson(user, body); }
  @Put('teams/:id/members') teamMembers(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(teamMembersSchema)) body: any) { return this.service.setTeamMembersAs(user, id, body.userIds); }
  @Get('changes') changes(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) { return this.service.changes(user, limit ? Number(limit) : 50); }
}
