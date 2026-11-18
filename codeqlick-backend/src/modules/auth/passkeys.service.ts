import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { Passkey, User } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { passkeyAddedEmail } from './auth-emails.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService, toAuthUser, type AuthTokens, type ClientInfo } from './auth.service.js';
import { PasskeyRepository } from './passkeys.repository.js';
import { PasswordService } from './password.service.js';

/** How many passkeys an account may have (decision 104). */
export const MAX_PASSKEYS = 10;
/** How long a ceremony (the options until the browser's answer) may take. */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60_000;

const RP_NAME = 'Codeqlick';
const DEFAULT_NAME = 'Passkey';

/** A passkey as its owner sees it: never the key. */
export interface PasskeyView {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface PasskeyLoginOptions {
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
}

function toView(passkey: Passkey): PasskeyView {
  return {
    id: passkey.id,
    name: passkey.name,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
  };
}

/**
 * The signature counter only grows; an authenticator that doesn't count (synced passkeys) always
 * reports 0, which is accepted while the stored one is 0 too.
 */
export function counterAccepted(stored: number, received: number): boolean {
  return received > stored || (received === 0 && stored === 0);
}

/** The challenge the browser signed, from the response's client data; null when unreadable. */
export function signedChallenge(clientDataJSON: string): string | null {
  try {
    const data: unknown = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
    const challenge = (data as { challenge?: unknown } | null)?.challenge;
    return typeof challenge === 'string' && challenge.length > 0 ? challenge : null;
  } catch {
    return null;
  }
}

/** The account a passkey belongs to, as stored in it when it was created (WebAuthn user.id). */
function userHandleOf(userId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(userId, 'utf8'));
}

/** Passkeys (WebAuthn): adding, listing, renaming and deleting them, and signing in with one. */
@Injectable()
export class PasskeyService {
  private readonly logger = new Logger(PasskeyService.name);

  constructor(
    private readonly repository: PasskeyRepository,
    private readonly users: AuthRepository,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly config: AppConfigService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
  ) {}

  async list(userId: string): Promise<{ items: PasskeyView[] }> {
    await this.activeUser(userId);
    const passkeys = await this.repository.listForUser(userId);
    return { items: passkeys.map(toView) };
  }

  /** First step of adding a passkey: the password again, then the browser's creation options. */
  async registrationOptions(
    userId: string,
    password: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.activeUser(userId);
    await this.checkPassword(user, password);
    const existing = await this.repository.listForUser(user.id);
    if (existing.length >= MAX_PASSKEYS) {
      throw new ConflictException(`An account can have up to ${MAX_PASSKEYS} passkeys`);
    }
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: this.config.webauthnRpId,
      userName: user.email,
      userDisplayName: user.name,
      userID: userHandleOf(user.id),
      attestationType: 'none',
      timeout: PASSKEY_CHALLENGE_TTL_MS,
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports,
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await this.repository.replaceRegisterChallenge(
      user.id,
      options.challenge,
      new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
    );
    return options;
  }

  /** Second step: the browser's attestation is checked and the passkey stored. */
  async register(
    userId: string,
    response: RegistrationResponseJSON,
    name?: string,
  ): Promise<PasskeyView> {
    const user = await this.activeUser(userId);
    const challenge = signedChallenge(response.response.clientDataJSON);
    if (
      !challenge ||
      !(await this.repository.consumeRegisterChallenge(user.id, challenge, new Date()))
    ) {
      throw new BadRequestException('The passkey request expired, start again');
    }

    let info;
    try {
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.config.webauthnOrigins,
        expectedRPID: this.config.webauthnRpId,
        requireUserVerification: true,
      });
      if (!result.verified) throw new Error('not verified');
      info = result.registrationInfo;
    } catch (error) {
      this.logger.warn(`Passkey registration refused: ${(error as Error).message}`);
      throw new BadRequestException('The passkey could not be verified');
    }

    const created = await this.repository.create(
      {
        userId: user.id,
        credentialId: info.credential.id,
        publicKey: info.credential.publicKey,
        counter: info.credential.counter,
        transports: info.credential.transports ?? response.response.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        name: name?.trim() || DEFAULT_NAME,
      },
      MAX_PASSKEYS,
    );
    if (created.status === 'limit') {
      throw new ConflictException(`An account can have up to ${MAX_PASSKEYS} passkeys`);
    }
    if (created.status === 'duplicate') {
      throw new ConflictException('This passkey is already registered');
    }
    const passkey = created.passkey;

    await this.activity.record(toAuthUser(user), {
      action: 'account.passkey_added',
      targetId: passkey.id,
      targetLabel: passkey.name,
    });
    this.sendAddedEmail(user, passkey);
    return toView(passkey);
  }

  /** A sign-in's options: no allowed credentials, so the browser offers every passkey it has. */
  async loginOptions(): Promise<PasskeyLoginOptions> {
    const options = await generateAuthenticationOptions({
      rpID: this.config.webauthnRpId,
      userVerification: 'required',
      timeout: PASSKEY_CHALLENGE_TTL_MS,
    });
    const challengeId = await this.repository.createLoginChallenge(
      options.challenge,
      new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
    );
    return { options, challengeId };
  }

  /**
   * Signs in with a passkey: it counts as both factors, so no code is asked; otherwise the same as
   * a password sign-in (session, new-device email, inactive accounts refused).
   */
  async login(
    challengeId: string,
    response: AuthenticationResponseJSON,
    client: ClientInfo = {},
  ): Promise<AuthTokens> {
    const challenge = await this.repository.consumeLoginChallenge(challengeId, new Date());
    if (!challenge) throw new UnauthorizedException('The sign-in expired, start again');

    const passkey = await this.repository.findByCredentialId(response.id);
    if (!passkey) throw new UnauthorizedException('Unknown passkey');
    const handle = response.response.userHandle;
    if (handle && Buffer.from(handle, 'base64url').toString('utf8') !== passkey.userId) {
      throw new UnauthorizedException('Unknown passkey');
    }

    const stored = Number(passkey.counter);
    let newCounter: number;
    try {
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.config.webauthnOrigins,
        expectedRPID: this.config.webauthnRpId,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: stored,
          transports: passkey.transports,
        },
      });
      if (!result.verified) throw new Error('not verified');
      newCounter = result.authenticationInfo.newCounter;
    } catch (error) {
      this.logger.warn(`Passkey sign-in refused: ${(error as Error).message}`);
      throw new UnauthorizedException('The passkey could not be verified');
    }
    if (!counterAccepted(stored, newCounter)) {
      this.logger.warn(`Passkey ${passkey.id}: counter went from ${stored} to ${newCounter}`);
      throw new UnauthorizedException('The passkey could not be verified');
    }

    const user = passkey.user;
    if (!user.isActive || !user.registeredAt) {
      throw new UnauthorizedException('This passkey cannot sign in');
    }
    if (!(await this.repository.markUsed(passkey.id, passkey.counter, newCounter))) {
      throw new UnauthorizedException('The passkey could not be verified');
    }
    return this.auth.signInVerified(user, client);
  }

  async rename(caller: AuthUser, id: string, name: string): Promise<PasskeyView> {
    const user = await this.activeUser(caller.id);
    const passkey = await this.repository.rename(user.id, id, name.trim());
    if (!passkey) throw new NotFoundException('Passkey not found');
    await this.activity.record(toAuthUser(user), {
      action: 'account.passkey_renamed',
      targetId: passkey.id,
      targetLabel: passkey.name,
    });
    return toView(passkey);
  }

  /** Deletes one of the caller's passkeys; needs the password, as adding one does. */
  async remove(caller: AuthUser, id: string, password: string): Promise<void> {
    const user = await this.activeUser(caller.id);
    await this.checkPassword(user, password);
    const passkey = await this.repository.delete(user.id, id);
    if (!passkey) throw new NotFoundException('Passkey not found');
    await this.activity.record(toAuthUser(user), {
      action: 'account.passkey_deleted',
      targetId: passkey.id,
      targetLabel: passkey.name,
    });
  }

  private async activeUser(userId: string): Promise<User> {
    const user = await this.users.findUserById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');
    return user;
  }

  /** 400 with a field error, not 401: the caller is signed in, they just mistyped it. */
  private async checkPassword(user: User, password: string): Promise<void> {
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new BadRequestException({
        errors: [{ path: 'password', message: 'Current password is incorrect' }],
      });
    }
  }

  private sendAddedEmail(user: User, passkey: Passkey): void {
    const locale = toApiLocale(user.locale);
    const site = this.config.siteUrl;
    const accountUrl = `${site}/${locale}/${user.role === 'ADMIN' ? 'admin' : 'portal'}/account`;
    this.mail
      .send(passkeyAddedEmail(user, passkey, accountUrl, locale, site))
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to send the passkey-added email: ${reason}`);
      });
  }
}
