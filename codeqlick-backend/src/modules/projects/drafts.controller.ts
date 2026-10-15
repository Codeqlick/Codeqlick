import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { createDraftSchema, type CreateDraftInput } from './projects.schemas.js';
import { ProjectsService, type UpdateDraftView } from './projects.service.js';

/**
 * Draft updates sent with a project's release key (`Authorization: Bearer cqr_…`), e.g. a summary
 * of the work done generated from the repository. The team reviews them before the client sees them.
 */
@ApiTags('releases')
@Controller('drafts')
export class DraftsController {
  constructor(private readonly projects: ProjectsService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiHeader({ name: 'Authorization', description: 'Bearer <release key>' })
  @Post()
  receive(
    @Headers('authorization') authorization: string | undefined,
    @Body({ schema: createDraftSchema }) body: CreateDraftInput,
  ): Promise<UpdateDraftView> {
    const key = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1] ?? '';
    return this.projects.receiveDraft(key, body);
  }
}
