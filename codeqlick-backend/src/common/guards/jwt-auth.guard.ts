import {
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { API_TOKEN_PREFIX, API_TOKEN_RESOLVER, type ApiTokenResolver } from '../api-tokens.js';
import { CLOUD_API_KEY } from '../decorators/cloud-api.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AccessTokenPayload } from '../types/auth-user.js';
import type { AppRequest } from '../types/request.js';

/**
 * Global guard: every route requires a valid `Authorization: Bearer <jwt>` unless it is
 * marked with @Public(). Routes marked with @CloudApi() also take a Cloud API token (`cqk_…`).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Optional() @Inject(API_TOKEN_RESOLVER) private readonly apiTokens?: ApiTokenResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    if (token.startsWith(API_TOKEN_PREFIX)) {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(CLOUD_API_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed || !this.apiTokens) {
        throw new UnauthorizedException('API tokens can only be used on the Cloud API');
      }
      const user = await this.apiTokens.resolve(token, request.ip);
      if (!user) throw new UnauthorizedException('Invalid or expired API token');
      request.user = user;
      return true;
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      (payload.role !== 'ADMIN' && payload.role !== 'CLIENT')
    ) {
      throw new UnauthorizedException('Invalid token claims');
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : '',
      role: payload.role,
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
      accountId: typeof payload.acc === 'string' ? payload.acc : payload.sub,
    };
    return true;
  }
}

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined;
  return value.trim();
}
