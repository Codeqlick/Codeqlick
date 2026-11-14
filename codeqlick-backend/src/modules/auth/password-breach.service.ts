import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2_000;

/** The field error's message when a new password appears in a known data breach (400). */
export const BREACHED_PASSWORD_MESSAGE = 'breached';

/**
 * Refuses new passwords found in Have I Been Pwned's Pwned Passwords (architecture 4.3, decision
 * 56) with k-anonymity: only the first 5 hexadecimal characters of the password's SHA-1 leave the
 * server, and the answer is padded. Off unless `PASSWORD_BREACH_CHECK` is on. Fails open: when the
 * service can't be reached the password is accepted, so a third party's outage never blocks anyone.
 */
@Injectable()
export class PasswordBreachService {
  private readonly logger = new Logger(PasswordBreachService.name);

  constructor(private readonly config: AppConfigService) {}

  /** `400 { errors: [{ path, message: 'breached' }] }` when the password is known to be leaked. */
  async assertNotBreached(password: string, path: string): Promise<void> {
    if (await this.isBreached(password)) {
      throw new BadRequestException({ errors: [{ path, message: BREACHED_PASSWORD_MESSAGE }] });
    }
  }

  async isBreached(password: string): Promise<boolean> {
    if (!this.config.passwordBreachCheck) return false;
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    let body: string;
    try {
      const response = await fetch(RANGE_URL + prefix, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'codeqlick-api' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = await response.text();
    } catch (error) {
      this.logger.warn(`Pwned Passwords unreachable, accepting the password: ${String(error)}`);
      return false;
    }
    return body.split('\n').some((line) => {
      const [hashSuffix, count] = line.trim().split(':');
      // Padding rows carry a count of 0 and never match a real password.
      return hashSuffix?.toUpperCase() === suffix && Number(count) > 0;
    });
  }
}
