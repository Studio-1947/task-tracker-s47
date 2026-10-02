import { Module } from '@nestjs/common';
import { OrganisationController, OrgTreeController } from './organisation.controller';
import { OrganisationService } from './organisation.service';
import { UsersModule } from '../users/users.module';
@Module({ imports: [UsersModule], controllers: [OrganisationController, OrgTreeController], providers: [OrganisationService], exports: [OrganisationService] })
export class OrganisationModule {}
