import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { Realm, REALM_KEY } from '../decorators/realm.decorator.js';
import type { RealmName } from '../realm.js';
import type { AuthUser } from '../types/auth-user.js';
import { RealmGuard, WRONG_REALM } from './realm.guard.js';

class Undecorated {
  handler(): void {}
}

@Realm('NEOQLICK')
class NeoqlickOnly {
  handler(): void {}
}

@Realm('ANY')
class Anyone {
  handler(): void {}
}

@Realm('NEOQLICK')
class NeoqlickWithCodeqlickHandler {
  @Realm('CODEQLICK')
  handler(): void {}
}

class NeoqlickAndAdmins {
  @Realm('NEOQLICK', 'ADMIN')
  handler(): void {}
}

function userOf(realm: RealmName, role: 'ADMIN' | 'CLIENT' = 'CLIENT'): AuthUser {
  return { id: 'u1', email: 'a@b.c', name: 'A', role, realm };
}

function run(
  controller: new () => object,
  user: AuthUser | undefined,
  options: { isPublic?: boolean } = {},
): boolean {
  const guard = new RealmGuard(new Reflector());
  const handler = (controller.prototype as { handler: () => void }).handler;
  if (options.isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  try {
    return guard.canActivate(context);
  } finally {
    if (options.isPublic) Reflect.deleteMetadata(IS_PUBLIC_KEY, handler);
  }
}

describe('RealmGuard (architecture 4.18)', () => {
  it('lets a route without @Realm serve CODEQLICK accounts only (fail closed)', () => {
    expect(run(Undecorated, userOf('CODEQLICK'))).toBe(true);
    expect(() => run(Undecorated, userOf('NEOQLICK'))).toThrow(ForbiddenException);
    expect(() => run(Undecorated, userOf('NEOQLICK'))).toThrow(WRONG_REALM);
  });

  it("@Realm('NEOQLICK') refuses a CODEQLICK token and accepts a NEOQLICK one", () => {
    expect(run(NeoqlickOnly, userOf('NEOQLICK'))).toBe(true);
    expect(() => run(NeoqlickOnly, userOf('CODEQLICK'))).toThrow(WRONG_REALM);
  });

  it("@Realm('ANY') accepts both", () => {
    expect(run(Anyone, userOf('CODEQLICK'))).toBe(true);
    expect(run(Anyone, userOf('NEOQLICK'))).toBe(true);
  });

  it("a handler's @Realm overrides its controller's", () => {
    expect(run(NeoqlickWithCodeqlickHandler, userOf('CODEQLICK'))).toBe(true);
    expect(() => run(NeoqlickWithCodeqlickHandler, userOf('NEOQLICK'))).toThrow(WRONG_REALM);
  });

  it("@Realm('NEOQLICK', 'ADMIN') adds the team's admins, and only a CODEQLICK admin", () => {
    expect(run(NeoqlickAndAdmins, userOf('NEOQLICK'))).toBe(true);
    expect(run(NeoqlickAndAdmins, userOf('CODEQLICK', 'ADMIN'))).toBe(true);
    expect(() => run(NeoqlickAndAdmins, userOf('CODEQLICK', 'CLIENT'))).toThrow(WRONG_REALM);
    // A NEOQLICK account is never an admin (database constraint), but the guard checks the realm too.
    expect(run(NeoqlickAndAdmins, userOf('NEOQLICK', 'ADMIN'))).toBe(true);
  });

  it('skips public routes (no session: they read X-Realm themselves)', () => {
    expect(run(Undecorated, undefined, { isPublic: true })).toBe(true);
  });

  it('refuses a request without a session on a route that is not public', () => {
    expect(() => run(Undecorated, undefined)).toThrow(ForbiddenException);
  });

  it('reads the metadata the decorator writes', () => {
    expect(Reflect.getMetadata(REALM_KEY, NeoqlickOnly)).toEqual(['NEOQLICK']);
  });
});
