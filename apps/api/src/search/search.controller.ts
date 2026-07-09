import { Controller, Get, Query } from '@nestjs/common';
import { searchQuerySchema, type SearchQuery } from '@task-tracker/shared';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Global search — scoping (member vs admin) happens in the service. */
  @Get()
  find(@Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery, @CurrentUser() user: RequestUser) {
    return this.search.search(query.q, user);
  }
}
