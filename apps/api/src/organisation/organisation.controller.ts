import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { officeSchema, namedOrganisationUnitSchema, teamMembersSchema, workspaceTeamsSchema } from '@task-tracker/shared';
import { Roles } from '../common/decorators/roles.decorator'; import { RolesGuard } from '../common/guards/roles.guard'; import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'; import { Role } from '@task-tracker/shared';
import { OrganisationService } from './organisation.service';
@Controller('organisation') @UseGuards(RolesGuard) @Roles(Role.ADMIN)
export class OrganisationController { constructor(private readonly service: OrganisationService) {}
 @Get(':kind') list(@Param('kind') kind:'offices'|'clients'|'teams') { return this.service.list(kind); }
 @Post('offices') office(@Body(new ZodValidationPipe(officeSchema)) body:any) { return this.service.create('offices',body); }
 @Post('clients') client(@Body(new ZodValidationPipe(namedOrganisationUnitSchema)) body:any) { return this.service.create('clients',body); }
 @Post('teams') team(@Body(new ZodValidationPipe(namedOrganisationUnitSchema)) body:any) { return this.service.create('teams',body); }
 @Put('teams/:id/members') members(@Param('id',ParseUUIDPipe) id:string,@Body(new ZodValidationPipe(teamMembersSchema)) body:any) { return this.service.setTeamMembers(id,body.userIds); }
 @Get('teams/:id/members') teamMembers(@Param('id',ParseUUIDPipe) id:string) { return this.service.teamMemberIds(id); }
 @Put('workspaces/:id/teams') workspaceTeams(@Param('id',ParseUUIDPipe) id:string,@Body(new ZodValidationPipe(workspaceTeamsSchema)) body:any) { return this.service.setWorkspaceTeams(id,body.teamIds); }
 @Get('workspaces/:id/teams') getWorkspaceTeams(@Param('id',ParseUUIDPipe) id:string) { return this.service.workspaceTeamIds(id); }
}
