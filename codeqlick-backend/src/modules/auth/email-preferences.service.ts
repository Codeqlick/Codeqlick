import { Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthRepository } from './auth.repository.js';
import {
  maskEmail,
  verifyUnsubscribeToken,
  type UnsubscribeClaim,
  type UnsubscribeKind,
} from './unsubscribe-token.js';

/** What the website's unsubscribe page shows and changes (architecture 4.3, decision 50). */
export interface EmailPreference {
  kind: UnsubscribeKind;
  subscribed: boolean;
  /** Masked (`l***@example.com`): the link must not reveal whose it is. */
  email: string;
}

const FIELD = { digest: 'weeklyDigest', report: 'monthlyReport' } as const;

/** One answer for a forged token and a deleted account, so links reveal nothing. */
const NOT_FOUND = 'Unsubscribe link not found';

/**
 * Unsubscribe links of the optional emails (the weekly summary and the monthly website report):
 * they turn one of them off without signing in. Deactivated accounts are treated like any other:
 * the preference is just stored.
 */
@Injectable()
export class EmailPreferencesService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: AppConfigService,
  ) {}

  /** What a token is about, without changing anything (link scanners open it). */
  async get(token: string): Promise<EmailPreference> {
    const claim = this.claim(token);
    const user = await this.repository.findUserById(claim.userId);
    if (!user) throw new NotFoundException(NOT_FOUND);
    return {
      kind: claim.kind,
      subscribed: user[FIELD[claim.kind]],
      email: maskEmail(user.email),
    };
  }

  /** Turns the token's email on or off; the same answer when it already was. */
  async set(token: string, subscribed: boolean): Promise<EmailPreference> {
    const claim = this.claim(token);
    const user = await this.repository.findUserById(claim.userId);
    if (!user) throw new NotFoundException(NOT_FOUND);
    if (user[FIELD[claim.kind]] !== subscribed) {
      await this.repository.setPreferences(
        user.id,
        claim.kind === 'digest' ? { weeklyDigest: subscribed } : { monthlyReport: subscribed },
      );
    }
    return { kind: claim.kind, subscribed, email: maskEmail(user.email) };
  }

  /** The provider's one-click `POST`: turns the token's email off. */
  async unsubscribe(token: string): Promise<void> {
    await this.set(token, false);
  }

  private claim(token: string): UnsubscribeClaim {
    const claim = verifyUnsubscribeToken(token, this.config.jwtAccessSecret);
    if (!claim) throw new NotFoundException(NOT_FOUND);
    return claim;
  }
}
