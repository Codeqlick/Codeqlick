import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { IndexNowService } from './indexnow.service.js';

@ApiTags('indexnow')
@Public()
@Controller('indexnow')
export class IndexNowController {
  constructor(private readonly indexNow: IndexNowService) {}

  /** The IndexNow key (public by design) the website serves as /indexnow-key.txt; 404 off. */
  @Get('key')
  key(): { key: string } {
    return this.indexNow.publicKey();
  }
}
