import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { bearerKey } from './release-key.js';
import { createReleaseSchema, type CreateReleaseInput } from './projects.schemas.js';
import { ProjectsService, type PostedProjectUpdate } from './projects.service.js';

/**
 * Releases published by a project's deploy pipeline. No user session: the project's release key
 * (`Authorization: Bearer cqr_…`, made in the admin panel) says which project it is.
 */
@ApiTags('releases')
@Controller('releases')
export class ReleasesController {
  constructor(private readonly projects: ProjectsService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiHeader({ name: 'Authorization', description: 'Bearer <release key>' })
  @Post()
  publish(
    @Headers('authorization') authorization: string | undefined,
    @Body({ schema: createReleaseSchema }) body: CreateReleaseInput,
  ): Promise<PostedProjectUpdate> {
    return this.projects.publishWithKey(bearerKey(authorization), body);
  }
}
