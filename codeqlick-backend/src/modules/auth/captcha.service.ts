import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5_000;

/** The field error the API answers when the Turnstile token is missing or refused (400). */
export const CAPTCHA_ERROR = { path: 'captcha', message: 'captcha' } as const;

/**
 * Cloudflare Turnstile on sign-up and sign-in (architecture 4.3, decision 28). Off without
 * `TURNSTILE_SECRET_KEY`. When Cloudflare can't be reached the request goes through: an outage of
 * a third party must not lock everyone out (the rate limits still apply).
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly config: AppConfigService) {}

  async verify(token: string | undefined, ip: string | null | undefined): Promise<void> {
    const secret = this.config.turnstileSecret;
    if (!secret) return;
    if (!token) throw new BadRequestException({ errors: [CAPTCHA_ERROR] });
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    let result: { success?: unknown; 'error-codes'?: unknown };
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      result = (await response.json()) as typeof result;
    } catch (error) {
      this.logger.warn(`Turnstile unreachable, letting the request through: ${String(error)}`);
      return;
    }
    if (result.success !== true) {
      this.logger.log(`Turnstile refused a token: ${JSON.stringify(result['error-codes'] ?? [])}`);
      throw new BadRequestException({ errors: [CAPTCHA_ERROR] });
    }
  }
}
