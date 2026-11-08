import { Module } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { CitasController, CitasPublicController } from './citas.controller.js';
import { CitasRepository } from './citas.repository.js';
import { CitasService } from './citas.service.js';

/** Online bookings at citas.codeqlick.com (architecture 4.9). */
@Module({
  imports: [MeetingsModule],
  controllers: [CitasPublicController, CitasController],
  providers: [CitasService, CitasRepository],
})
export class CitasModule {}
