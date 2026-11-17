import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthRepository } from './auth.repository.js';
import {
  maskEmail,
  verifyUnsubscribeToken,
  type UnsubscribeClaim,
  type UnsubscribeKind,
} from './unsubscribe-token.js';

/** What the website's unsubscribe page shows and changes (architecture 4.3, decision 70). */
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
      // Deleted since it was read: the same answer as a deleted account.
      const saved = await this.repository.setPreferencesIfExists(
        user.id,
        claim.kind === 'digest' ? { weeklyDigest: subscribed } : { monthlyReport: subscribed },
      );
      if (!saved) throw new NotFoundException(NOT_FOUND);
    }
    return { kind: claim.kind, subscribed, email: maskEmail(user.email) };
  }

  /**
   * The website's page of a link opened in a browser (`GET /email/unsubscribe`), in the account's
   * language. Changes nothing; a wrong token still goes to the page, which says the link is invalid.
   */
  async pageUrl(token: string): Promise<string> {
    const claim = verifyUnsubscribeToken(token, this.config.jwtAccessSecret);
    const user = claim ? await this.repository.findUserById(claim.userId) : null;
    const locale: ApiLocale = user ? toApiLocale(user.locale) : 'en';
    const site = this.config.siteUrl.replace(/\/+$/, '');
    return `${site}/${locale}/email/unsubscribe?token=${encodeURIComponent(token)}`;
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
