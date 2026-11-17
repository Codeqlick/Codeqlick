import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { SwipeStorage } from '../swipe/swipe.storage.js';

/**
 * The shared verification photos of the 18+ apps (architecture 4.16, decision 113), in a
 * sub-folder of Swipe's private volume (out of the backups, mode 0600): Swipe's listing only looks
 * at files, so its orphan cleanup never touches them.
 */
@Injectable()
export class AdultVerificationStorage extends SwipeStorage {
  protected override dir(): string {
    return join(this.config.swipeUploadsDir, 'verification');
  }
}
