import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { CloudBadgesService } from './cloud-badges.service.js';
import { badgeFileParamSchema, type BadgeFileParam } from './cloud.schemas.js';

/** README badges: shown as images on other sites, so public (architecture 4.13). */
@ApiTags('cloud')
@Public()
@Controller('cloud')
export class CloudBadgesController {
  constructor(private readonly badges: CloudBadgesService) {}

  @Get('badges/:file')
  // GitHub fetches README images from a few shared addresses; the API caches each badge 60 s.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async deploy(
    @Param({ schema: badgeFileParamSchema }) params: BadgeFileParam,
    @Res() res: Response,
  ): Promise<void> {
    const svg = await this.badges.deployBadge(params.file.slice(0, -'.svg'.length));
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    // Shown as an <img> on other sites (READMEs): helmet's same-origin default would block it.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(svg);
  }
}
