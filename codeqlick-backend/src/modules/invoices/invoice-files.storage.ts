import { Injectable } from '@nestjs/common';
import { ProjectFilesStorage } from '../projects/project-files.storage.js';

/** The PDFs of the team's invoices, in an `invoices` folder inside UPLOADS_DIR. */
@Injectable()
export class InvoiceFilesStorage extends ProjectFilesStorage {
  protected override readonly folder = 'invoices';
}
