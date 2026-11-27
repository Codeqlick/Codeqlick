import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { Passkey, User } from '../../generated/prisma/client.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { AuthRepository } from './auth.repository.js';
import { AuthService, toAuthUser } from './auth.service.js';
import type { PasskeyRepository } from './passkeys.repository.js';
import {
  counterAccepted,
  MAX_PASSKEYS,
  PasskeyService,
  signedChallenge,
} from './passkeys.service.js';
import type { PasswordBreachService } from './password-breach.service.js';
import type { UsernameService } from './username.service.js';
import type { PasswordService } from './password.service.js';

// The verifications are mocked: e2e tests run them for real with a software authenticator.
const webauthn = vi.hoisted(() => ({
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));
vi.mock('@simplewebauthn/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@simplewebauthn/server')>()),
  ...webauthn,
}));

const USER_ID = '7d3c3c1e-3c9b-4a43-9a43-2f0f2f8f1a01';
const PASSKEY_ID = 'b2b2b2b2-0000-4000-8000-000000000002';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'ada@codeqlick.com',
    passwordHash: '$argon2id$stub',
    name: 'Ada',
    role: 'CLIENT',
    locale: 'ES',
    isActive: true,
    totpSecret: null,
    totpEnabledAt: null,
    totpLastStep: null,
    totpRecoveryHashes: [],
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

function makePasskey(overrides: Partial<Passkey> = {}): Passkey {
  return {
    id: PASSKEY_ID,
    userId: USER_ID,
    credentialId: 'cred-1',
    publicKey: new Uint8Array([1, 2, 3]),
    counter: 0n,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: true,
    name: 'MacBook',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    lastUsedAt: null,
    ...overrides,
  } as Passkey;
}

const b64 = (value: string) => Buffer.from(value).toString('base64url');
const clientData = (challenge: string, type: string) =>
  b64(JSON.stringify({ type, challenge, origin: 'http://localhost:3000' }));

function registrationResponse(challenge = 'reg-challenge'): RegistrationResponseJSON {
  return {
    id: 'cred-1',
    rawId: 'cred-1',
    type: 'public-key',
    response: {
      clientDataJSON: clientData(challenge, 'webauthn.create'),
      attestationObject: 'AA',
      transports: ['internal'],
    },
    clientExtensionResults: {},
  };
}

function authenticationResponse(userHandle = b64(USER_ID)): AuthenticationResponseJSON {
  return {
    id: 'cred-1',
    rawId: 'cred-1',
    type: 'public-key',
    response: {
      clientDataJSON: clientData('login-challenge', 'webauthn.get'),
      authenticatorData: 'AA',
      signature: 'AA',
      userHandle,
    },
    clientExtensionResults: {},
  };
}

/** The attestation verifies (as the library answers for a good one). */
function verified() {
  webauthn.verifyRegistrationResponse.mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: { id: 'cred-1', publicKey: new Uint8Array([9]), counter: 0 },
      credentialDeviceType: 'multiDevice',
      credentialBackedUp: true,
    },
  });
}

/** The assertion verifies, reporting `newCounter`. */
function asserted(newCounter: number) {
  webauthn.verifyAuthenticationResponse.mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter },
  });
}

describe('passkey helpers', () => {
  it('accepts a growing counter, or 0 from an authenticator that never counts', () => {
    expect(counterAccepted(0, 0)).toBe(true);
    expect(counterAccepted(0, 1)).toBe(true);
    expect(counterAccepted(5, 6)).toBe(true);
    expect(counterAccepted(5, 5)).toBe(false);
    expect(counterAccepted(5, 4)).toBe(false);
    expect(counterAccepted(5, 0)).toBe(false);
  });

  it('reads the signed challenge from the client data', () => {
    expect(signedChallenge(clientData('abc', 'webauthn.get'))).toBe('abc');
    expect(signedChallenge(b64('not json'))).toBeNull();
    expect(signedChallenge(b64('{"challenge":1}'))).toBeNull();
  });
});

describe('PasskeyService', () => {
  let repository: Record<keyof PasskeyRepository, ReturnType<typeof vi.fn>>;
  let users: { findUserById: ReturnType<typeof vi.fn> };
  let authRepository: Record<string, ReturnType<typeof vi.fn>>;
  let passwords: { verify: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let service: PasskeyService;

  beforeEach(() => {
    webauthn.verifyRegistrationResponse.mockReset();
    webauthn.verifyAuthenticationResponse.mockReset();
    repository = {
      listForUser: vi.fn().mockResolvedValue([]),
      countForUser: vi.fn().mockResolvedValue(0),
      findByCredentialId: vi.fn(),
      replaceRegisterChallenge: vi.fn().mockResolvedValue(undefined),
      createLoginChallenge: vi.fn().mockResolvedValue('c0c0c0c0-0000-4000-8000-000000000003'),
      consumeRegisterChallenge: vi.fn().mockResolvedValue(true),
      consumeLoginChallenge: vi.fn().mockResolvedValue('login-challenge'),
      create: vi.fn(),
      markUsed: vi.fn().mockResolvedValue(true),
      rename: vi.fn(),
      delete: vi.fn(),
      deleteExpiredChallenges: vi.fn(),
    };
    users = { findUserById: vi.fn().mockResolvedValue(makeUser()) };
    authRepository = {
      createSession: vi.fn().mockResolvedValue(undefined),
      listSessionUserAgents: vi.fn().mockResolvedValue([]),
    };
    passwords = { verify: vi.fn().mockResolvedValue(true) };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    activity = { record: vi.fn().mockResolvedValue(undefined) };
    const config = {
      jwtAccessSecret: 'unit-secret-unit-secret-unit-secret-unit-secret',
      jwtAccessTtl: 900,
      refreshTokenTtlDays: 30,
      siteUrl: 'http://localhost:3000',
      webauthnRpId: 'localhost',
      webauthnOrigins: ['http://localhost:3000', 'http://meetings.localhost:3000'],
    } as AppConfigService;
    const jwt = { signAsync: vi.fn().mockResolvedValue('access-token') };
    const auth = new AuthService(
      authRepository as unknown as AuthRepository,
      passwords as unknown as PasswordService,
      jwt as unknown as JwtService,
      config,
      mail as unknown as MailService,
      activity as unknown as ActivityService,
      {} as PasswordBreachService,
      {} as UsernameService,
    );
    service = new PasskeyService(
      repository as unknown as PasskeyRepository,
      users as unknown as AuthRepository,
      auth,
      passwords as unknown as PasswordService,
      config,
      mail as unknown as MailService,
      activity as unknown as ActivityService,
    );
  });

  describe('registrationOptions', () => {
    it('asks for a discoverable passkey with user verification, excluding the ones registered', async () => {
      repository.listForUser.mockResolvedValue([makePasskey()]);

      const options = await service.registrationOptions(USER_ID, 'password');

      expect(options.rp).toEqual({ name: 'Codeqlick', id: 'localhost' });
      expect(options.user.name).toBe('ada@codeqlick.com');
      expect(Buffer.from(options.user.id, 'base64url').toString()).toBe(USER_ID);
      expect(options.authenticatorSelection).toMatchObject({
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      });
      expect(options.excludeCredentials).toEqual([
        { id: 'cred-1', type: 'public-key', transports: ['internal'] },
      ]);
      expect(options.attestation).toBe('none');
      const [userId, challenge, expiresAt] = repository.replaceRegisterChallenge.mock.calls[0]!;
      expect(userId).toBe(USER_ID);
      expect(challenge).toBe(options.challenge);
      expect((expiresAt as Date).getTime() - Date.now()).toBeGreaterThan(4 * 60_000);
    });

    it('refuses a wrong password with a field error', async () => {
      passwords.verify.mockResolvedValue(false);
      await expect(service.registrationOptions(USER_ID, 'nope')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.replaceRegisterChallenge).not.toHaveBeenCalled();
    });

    it(`refuses past ${MAX_PASSKEYS} passkeys`, async () => {
      repository.listForUser.mockResolvedValue(
        Array.from({ length: MAX_PASSKEYS }, (_, i) => makePasskey({ credentialId: `c${i}` })),
      );
      await expect(service.registrationOptions(USER_ID, 'password')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('register', () => {
    it('checks the attestation against the challenge, stores the passkey, logs and emails', async () => {
      verified();
      repository.create.mockResolvedValue({ status: 'created', passkey: makePasskey() });

      const view = await service.register(USER_ID, registrationResponse(), 'MacBook');

      expect(repository.consumeRegisterChallenge).toHaveBeenCalledWith(
        USER_ID,
        'reg-challenge',
        expect.any(Date),
      );
      expect(webauthn.verifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedChallenge: 'reg-challenge',
          expectedRPID: 'localhost',
          expectedOrigin: ['http://localhost:3000', 'http://meetings.localhost:3000'],
          requireUserVerification: true,
        }),
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          credentialId: 'cred-1',
          transports: ['internal'],
          deviceType: 'multiDevice',
          backedUp: true,
          name: 'MacBook',
        }),
        MAX_PASSKEYS,
      );
      expect(view).toEqual({
        id: PASSKEY_ID,
        name: 'MacBook',
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2026-11-01T10:00:00.000Z',
        lastUsedAt: null,
      });
      expect(view).not.toHaveProperty('publicKey');
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ id: USER_ID }),
        expect.objectContaining({ action: 'account.passkey_added', targetLabel: 'MacBook' }),
      );
      const message = mail.send.mock.calls[0]![0] as { subject: string; text: string };
      expect(message.subject).toContain('llave de acceso');
      expect(message.text).toContain('MacBook');
    });

    it('refuses an expired or already used challenge before verifying anything', async () => {
      repository.consumeRegisterChallenge.mockResolvedValue(false);
      await expect(service.register(USER_ID, registrationResponse())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(webauthn.verifyRegistrationResponse).not.toHaveBeenCalled();
    });

    it('refuses an attestation that does not verify', async () => {
      webauthn.verifyRegistrationResponse.mockRejectedValue(new Error('Unexpected origin'));
      await expect(service.register(USER_ID, registrationResponse())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('refuses the 11th passkey even when two are added at once', async () => {
      verified();
      repository.create.mockResolvedValue({ status: 'limit' });
      await expect(service.register(USER_ID, registrationResponse())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns discoverable options and the challenge id', async () => {
      const result = await service.loginOptions();
      expect(result.challengeId).toBe('c0c0c0c0-0000-4000-8000-000000000003');
      expect(result.options.rpId).toBe('localhost');
      expect(result.options.userVerification).toBe('required');
      expect(result.options.allowCredentials ?? []).toEqual([]);
      expect(repository.createLoginChallenge).toHaveBeenCalledWith(
        result.options.challenge,
        expect.any(Date),
      );
    });

    it('issues a session without asking for the code, even with two-step verification on', async () => {
      const user = makeUser({ totpEnabledAt: new Date() });
      repository.findByCredentialId.mockResolvedValue({ ...makePasskey({ counter: 3n }), user });
      asserted(4);

      const tokens = await service.login(
        'c0c0c0c0-0000-4000-8000-000000000003',
        authenticationResponse(),
        { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/131.0', ip: '203.0.113.9' },
      );

      expect(tokens).toMatchObject({ accessToken: 'access-token', user: toAuthUser(user) });
      expect(tokens).not.toHaveProperty('twoFactorRequired');
      expect(authRepository.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, ip: '203.0.113.9' }),
      );
      expect(repository.markUsed).toHaveBeenCalledWith(PASSKEY_ID, 3n, 4);
      expect(webauthn.verifyAuthenticationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedChallenge: 'login-challenge',
          requireUserVerification: true,
          credential: expect.objectContaining({ id: 'cred-1', counter: 3 }),
        }),
      );
      // A browser and system the account hadn't used: the new-device email.
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@codeqlick.com' }));
    });

    it('refuses a used or expired challenge', async () => {
      repository.consumeLoginChallenge.mockResolvedValue(null);
      await expect(
        service.login('c0c0c0c0-0000-4000-8000-000000000003', authenticationResponse()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.findByCredentialId).not.toHaveBeenCalled();
    });

    it('refuses an unknown passkey', async () => {
      repository.findByCredentialId.mockResolvedValue(null);
      await expect(
        service.login('c0c0c0c0-0000-4000-8000-000000000003', authenticationResponse()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a passkey answered for another account', async () => {
      repository.findByCredentialId.mockResolvedValue({ ...makePasskey(), user: makeUser() });
      asserted(1);
      await expect(
        service.login(
          'c0c0c0c0-0000-4000-8000-000000000003',
          authenticationResponse(b64('someone-else')),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a counter that went backwards', async () => {
      repository.findByCredentialId.mockResolvedValue({
        ...makePasskey({ counter: 7n }),
        user: makeUser(),
      });
      asserted(7);
      await expect(
        service.login('c0c0c0c0-0000-4000-8000-000000000003', authenticationResponse()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authRepository.createSession).not.toHaveBeenCalled();
    });

    it('refuses an inactive account', async () => {
      repository.findByCredentialId.mockResolvedValue({
        ...makePasskey(),
        user: makeUser({ isActive: false }),
      });
      asserted(0);
      await expect(
        service.login('c0c0c0c0-0000-4000-8000-000000000003', authenticationResponse()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authRepository.createSession).not.toHaveBeenCalled();
    });

    it('refuses an assertion that does not verify', async () => {
      repository.findByCredentialId.mockResolvedValue({ ...makePasskey(), user: makeUser() });
      webauthn.verifyAuthenticationResponse.mockRejectedValue(new Error('bad signature'));
      await expect(
        service.login('c0c0c0c0-0000-4000-8000-000000000003', authenticationResponse()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('rename and remove', () => {
    const caller = toAuthUser(makeUser());

    it('renames and logs it', async () => {
      repository.rename.mockResolvedValue(makePasskey({ name: 'Phone' }));
      const view = await service.rename(caller, PASSKEY_ID, ' Phone ');
      expect(repository.rename).toHaveBeenCalledWith(USER_ID, PASSKEY_ID, 'Phone');
      expect(view.name).toBe('Phone');
      expect(activity.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'account.passkey_renamed' }),
      );
    });

    it('answers 404 for a passkey that is not the caller’s', async () => {
      repository.rename.mockResolvedValue(null);
      repository.delete.mockResolvedValue(null);
      await expect(service.rename(caller, PASSKEY_ID, 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.remove(caller, PASSKEY_ID, 'password')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes only with the password', async () => {
      passwords.verify.mockResolvedValueOnce(false);
      await expect(service.remove(caller, PASSKEY_ID, 'wrong')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.delete).not.toHaveBeenCalled();

      repository.delete.mockResolvedValue(makePasskey());
      await service.remove(caller, PASSKEY_ID, 'password');
      expect(activity.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'account.passkey_deleted', targetLabel: 'MacBook' }),
      );
    });
  });
});
