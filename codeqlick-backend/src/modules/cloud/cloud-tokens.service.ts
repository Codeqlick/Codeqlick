import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { API_TOKEN_PREFIX, type ApiTokenResolver } from '../../common/api-tokens.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { CLI_TOKEN_DAYS, DEVICE_CODE_MINUTES, DEVICE_POLL_SECONDS, FREE } from './cloud-plans.js';
import type { CloudCtx } from './cloud-caller.js';
import { CloudRepository } from './cloud.repository.js';
import type { CreateTokenInput } from './cloud.schemas.js';
import { CloudTokensRepository, type TokenRow } from './cloud-tokens.repository.js';

export interface TokenView {
  id: string;
  name: string;
  prefix: string;
  team: { slug: string; name: string } | null;
  readOnly: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
}

export interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export type DevicePoll =
  | { status: 'pending' | 'denied' | 'expired' }
  | { status: 'approved'; token: string; user: { id: string; name: string; email: string } };

export interface DeviceView {
  userCode: string;
  clientName: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied';
}

const DAY_MS = 86_400_000;
/** Letters and digits nobody confuses (no 0/O, 1/I/L). */
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Last-used time is written at most this often per token. */
const TOUCH_EVERY_MS = 60_000;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const formatUserCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Cloud's API tokens and the CLI's device sign-in (architecture 4.13, decision 35). */
@Injectable()
export class CloudTokensService implements ApiTokenResolver {
  private readonly logger = new Logger(CloudTokensService.name);

  constructor(
    private readonly tokens: CloudTokensRepository,
    private readonly cloud: CloudRepository,
    private readonly config: AppConfigService,
  ) {}

  /** For JwtAuthGuard: the token's person, or null. Checked on every request. */
  async resolve(token: string, ip: string | undefined): Promise<AuthUser | null> {
    if (!/^cqk_[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
    const row = await this.tokens.findByHash(sha256(token));
    const now = new Date();
    if (!row) return null;
    if (row.expiresAt && row.expiresAt <= now) return null;
    if (!row.user.isActive || !row.user.registeredAt) return null;
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await this.tokens.touch(row.id, now, ip?.slice(0, 45) ?? null);
    }
    return {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      via: 'token',
      token: { id: row.id, name: row.name, teamId: row.teamId, readOnly: row.readOnly },
    };
  }

  async list(user: AuthUser): Promise<TokenView[]> {
    return (await this.tokens.list(user.id)).map(tokenView);
  }

  async create(
    ctx: CloudCtx,
    input: CreateTokenInput,
  ): Promise<{ token: string; item: TokenView }> {
    const { user } = ctx;
    if ((await this.tokens.count(user.id)) >= FREE.tokensPerPerson) {
      throw new ConflictException(`At most ${FREE.tokensPerPerson} tokens per person`);
    }
    let teamId: string | null = null;
    if (input.teamSlug) {
      const membership = await this.cloud.membership(input.teamSlug, user.id);
      if (!membership) throw new NotFoundException('Team not found');
      teamId = membership.teamId;
    }
    const expiresAt =
      input.expiresInDays === null ? null : new Date(Date.now() + input.expiresInDays * DAY_MS);
    const readOnly = input.readOnly ?? false;
    const issued = await this.issue(user.id, input.name, teamId, expiresAt, readOnly);
    // Events belong to a team: a token restricted to one is recorded there.
    if (teamId) await this.recordCreated(ctx, teamId, input.name, readOnly);
    return issued;
  }

  /** The `token.created` event (a failure is logged, never fails the change). */
  private async recordCreated(
    ctx: CloudCtx,
    teamId: string,
    name: string,
    readOnly: boolean,
  ): Promise<void> {
    try {
      await this.cloud.event({
        teamId,
        actorId: ctx.user.id,
        actorName: ctx.user.name || ctx.user.email,
        tokenName: ctx.user.token?.name ?? null,
        action: 'token.created',
        targetLabel: name,
        details: { readOnly },
        ip: ctx.ip,
      });
    } catch (error) {
      this.logger.error(`Could not record token.created: ${String(error)}`);
    }
  }

  async revoke(user: AuthUser, id: string): Promise<void> {
    if (!(await this.tokens.delete(user.id, id))) throw new NotFoundException('Token not found');
  }

  private async issue(
    userId: string,
    name: string,
    teamId: string | null,
    expiresAt: Date | null,
    readOnly: boolean,
  ): Promise<{ token: string; item: TokenView }> {
    const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const row = await this.tokens.create({
      userId,
      teamId,
      name,
      prefix: token.slice(0, 12),
      tokenHash: sha256(token),
      readOnly,
      expiresAt,
    });
    return { token, item: tokenView(row) };
  }

  // ── Device flow ─────────────────────────────────────────────────────────────────────────────

  async startDevice(clientName: string, locale: 'en' | 'es' = 'es'): Promise<DeviceStart> {
    const deviceCode = randomBytes(32).toString('base64url');
    let userCode = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      userCode = Array.from(
        { length: 8 },
        () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)],
      ).join('');
      if (!(await this.tokens.userCodeTaken(userCode))) break;
    }
    await this.tokens.createDevice({
      deviceCodeHash: sha256(deviceCode),
      userCode,
      clientName,
      expiresAt: new Date(Date.now() + DEVICE_CODE_MINUTES * 60_000),
    });
    const verificationUri = `${this.config.cloudUrl}/${locale}/cli`;
    return {
      deviceCode,
      userCode: formatUserCode(userCode),
      verificationUri,
      verificationUriComplete: `${verificationUri}?code=${formatUserCode(userCode)}`,
      expiresIn: DEVICE_CODE_MINUTES * 60,
      interval: DEVICE_POLL_SECONDS,
    };
  }

  async poll(deviceCode: string): Promise<DevicePoll> {
    const row = await this.tokens.findDeviceByHash(sha256(deviceCode));
    const now = new Date();
    if (!row || row.consumedAt) return { status: 'expired' };
    if (row.deniedAt) return { status: 'denied' };
    if (!row.approvedAt) {
      if (row.expiresAt <= now) return { status: 'expired' };
      if (
        row.lastPolledAt &&
        now.getTime() - row.lastPolledAt.getTime() < (DEVICE_POLL_SECONDS - 1) * 1000
      ) {
        throw new HttpException('Polling too fast', HttpStatus.TOO_MANY_REQUESTS);
      }
      await this.tokens.polled(row.id, now);
      return { status: 'pending' };
    }
    if (!row.userId || !(await this.tokens.consume(row.id, now))) return { status: 'expired' };
    const owner = await this.cloud.activeUser(row.userId);
    if (!owner) return { status: 'expired' };
    // CLI sign-ins are always Full (decision 61).
    const { token } = await this.issue(
      row.userId,
      `CLI · ${row.clientName}`.slice(0, 80),
      null,
      new Date(now.getTime() + CLI_TOKEN_DAYS * DAY_MS),
      false,
    );
    return { status: 'approved', token, user: owner };
  }

  async device(userCode: string): Promise<DeviceView> {
    const row = await this.tokens.findDeviceByUserCode(userCode);
    if (!row || row.consumedAt || (row.expiresAt <= new Date() && !row.approvedAt)) {
      throw new NotFoundException('This code is unknown or has expired');
    }
    return {
      userCode: formatUserCode(row.userCode),
      clientName: row.clientName,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: row.approvedAt ? 'approved' : row.deniedAt ? 'denied' : 'pending',
    };
  }

  async decide(user: AuthUser, userCode: string, approve: boolean): Promise<void> {
    if (user.via === 'token') throw new NotFoundException('This code is unknown or has expired');
    const row = await this.tokens.findDeviceByUserCode(userCode);
    if (!row || !(await this.tokens.decide(row.id, user.id, approve, new Date()))) {
      throw new NotFoundException('This code is unknown, expired or already answered');
    }
  }

  /** Hourly cleanup: expired tokens, device codes a day old, invitations a week past expiry. */
  async cleanup(now: Date): Promise<void> {
    await this.tokens.deleteExpired(now);
    await this.tokens.deleteDevicesBefore(new Date(now.getTime() - DAY_MS));
    await this.tokens.deleteExpiredInvites(new Date(now.getTime() - 7 * DAY_MS));
  }
}

function tokenView(row: TokenRow): TokenView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    team: row.team,
    readOnly: row.readOnly,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: row.lastUsedIp,
    createdAt: row.createdAt.toISOString(),
  };
}
