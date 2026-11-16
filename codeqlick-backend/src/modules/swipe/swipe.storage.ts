import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { AppConfigService } from '../../config/app-config.service.js';
import { isPrivateKey, PrivateFileStorage } from '../media/private-storage.js';

export function isStorageKey(key: string): boolean {
  return isPrivateKey(key);
}

/**
 * Swipe's photos on disk (`SWIPE_UPLOADS_DIR`), apart from the public media folder: nothing serves
 * this folder by name, every photo goes through the API, which checks who is asking.
 */
@Injectable()
export class SwipeStorage extends PrivateFileStorage {
  constructor(protected readonly config: AppConfigService) {
    super();
  }

  protected dir(): string {
    return this.config.swipeUploadsDir;
  }
}

/**
 * The video chat's verification photos (section 4.7), in a sub-folder of the same private volume:
 * Swipe's listing only looks at files, so its orphan cleanup never touches them.
 */
@Injectable()
export class VideochatPhotoStorage extends SwipeStorage {
  protected override dir(): string {
    return join(this.config.swipeUploadsDir, 'videochat');
  }
}
