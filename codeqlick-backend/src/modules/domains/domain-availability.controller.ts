import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { availabilityQuerySchema, type AvailabilityQuery } from './domains.schemas.js';
import { DomainsService, type AvailabilityResult } from './domains.service.js';

/** Whether a domain is free, for the website request and the portal (architecture 8.2). */
@ApiTags('domains')
@Controller('domains')
export class DomainAvailabilityController {
  constructor(private readonly domains: DomainsService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('availability')
  async availability(
    @Query({ schema: availabilityQuerySchema }) query: AvailabilityQuery,
  ): Promise<{ results: AvailabilityResult[] }> {
    const results = await this.domains.availability(query.name);
    if (!results) throw new BadRequestException('Type a name like peluqueria-ana or a domain');
    return { results };
  }
}
