import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { ApiTokenResolver } from '../api-tokens.js';
import { CLOUD_API_KEY } from '../decorators/cloud-api.decorator.js';
import type { AuthUser } from '../types/auth-user.js';
import type { AppRequest } from '../types/request.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const TOKEN = `cqk_${'a'.repeat(43)}`;

function tokenUser(readOnly: boolean): AuthUser {
  return {
    id: 'user-1',
    email: 'dev@example.com',
    name: 'Dev',
    role: 'CLIENT',
    realm: 'CODEQLICK',
    via: 'token',
    token: { id: 'token-1', name: 'CI', teamId: null, readOnly },
  };
}

function setup(user: AuthUser | null, claims: Record<string, unknown> = {}) {
  // Every route here is a @CloudApi() route, none @Public().
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => (key === CLOUD_API_KEY ? true : undefined)),
  } as unknown as Reflector;
  const jwt = {
    verifyAsync: vi.fn(async () => ({
      sub: 'user-2',
      email: 'me@example.com',
      name: 'Me',
      role: 'CLIENT',
      ...claims,
    })),
  } as unknown as JwtService;
  const resolver: ApiTokenResolver = { resolve: vi.fn(async () => user) };
  const guard = new JwtAuthGuard(reflector, jwt, resolver);
  const run = async (method: string, bearer = TOKEN) => {
    const request = {
      method,
      headers: { authorization: `Bearer ${bearer}` },
      ip: '203.0.113.7',
    } as unknown as AppRequest;
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const allowed = await guard.canActivate(context);
    return { allowed, request };
  };
  return { run, resolver };
}

describe('JwtAuthGuard and read-only Cloud tokens', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('lets a read-only token %s', async (method) => {
    const { run } = setup(tokenUser(true));
    const { allowed, request } = await run(method);
    expect(allowed).toBe(true);
    expect(request.user?.token?.readOnly).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses a read-only token on %s with 403',
    async (method) => {
      const { run } = setup(tokenUser(true));
      const attempt = run(method);
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toThrow('This token is read only');
    },
  );

  it('checks the method whatever its case', async () => {
    const { run } = setup(tokenUser(true));
    await expect(run('post')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run('get')).resolves.toMatchObject({ allowed: true });
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'leaves a full token alone on %s',
    async (method) => {
      const { run } = setup(tokenUser(false));
      const { allowed, request } = await run(method);
      expect(allowed).toBe(true);
      expect(request.user?.via).toBe('token');
    },
  );

  it.each(['POST', 'DELETE'])('leaves a signed-in session alone on %s', async (method) => {
    const { run, resolver } = setup(tokenUser(true));
    const { allowed, request } = await run(method, 'header.payload.signature');
    expect(allowed).toBe(true);
    expect(request.user).toMatchObject({ id: 'user-2', role: 'CLIENT' });
    expect(request.user?.token).toBeUndefined();
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  describe('the realm claim (architecture 4.18)', () => {
    it('reads rlm from the signed token', async () => {
      const { run } = setup(null, { rlm: 'NEOQLICK' });
      const { request } = await run('GET', 'header.payload.signature');
      expect(request.user?.realm).toBe('NEOQLICK');
    });

    it('reads a token without rlm (issued before realms existed) as CODEQLICK', async () => {
      const { run } = setup(null);
      const { request } = await run('GET', 'header.payload.signature');
      expect(request.user?.realm).toBe('CODEQLICK');
    });

    it('reads anything that is not NEOQLICK as CODEQLICK', async () => {
      const { run } = setup(null, { rlm: 'ADMIN' });
      const { request } = await run('GET', 'header.payload.signature');
      expect(request.user?.realm).toBe('CODEQLICK');
    });
  });
});
