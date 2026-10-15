import { Injectable } from '@nestjs/common';
import { ProjectFilesStorage } from '../projects/project-files.storage.js';

/** Files added to support requests, in a `ticket-files` folder inside UPLOADS_DIR. */
@Injectable()
export class TicketFilesStorage extends ProjectFilesStorage {
  protected override readonly folder = 'ticket-files';
}
