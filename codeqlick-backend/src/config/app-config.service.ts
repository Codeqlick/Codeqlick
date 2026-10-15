import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';

/** Typed, read-only accessors over the validated environment. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  /** Values were validated (and defaulted) by validateEnv at boot. */
  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get<Env[K]>(key) as Env[K];
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get port(): number {
    return this.get('PORT');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS');
  }

  /** Public URL of the website, without a trailing slash. */
  get siteUrl(): string {
    return this.get('SITE_URL');
  }

  get jwtAccessSecret(): string {
    return this.get('JWT_ACCESS_SECRET');
  }

  /** Access token lifetime in seconds. */
  get jwtAccessTtl(): number {
    return this.get('JWT_ACCESS_TTL');
  }

  get refreshTokenTtlDays(): number {
    return this.get('REFRESH_TOKEN_TTL_DAYS');
  }

  get smtp(): {
    host: string;
    port: number;
    secure: boolean;
    user: string | undefined;
    password: string | undefined;
  } {
    return {
      host: this.get('SMTP_HOST'),
      port: this.get('SMTP_PORT'),
      secure: this.get('SMTP_SECURE'),
      user: this.get('SMTP_USER'),
      password: this.get('SMTP_PASSWORD'),
    };
  }

  get mailFrom(): string {
    return this.get('MAIL_FROM');
  }

  /** Umami's API and the site's id in it; undefined while analytics isn't set up. */
  get umami(): { url: string; websiteId: string; username: string; password: string } | undefined {
    const url = this.get('UMAMI_URL');
    const websiteId = this.get('UMAMI_WEBSITE_ID');
    const password = this.get('UMAMI_PASSWORD');
    if (!url || !websiteId || !password) return undefined;
    return {
      url: url.replace(/\/+$/, ''),
      websiteId,
      username: this.get('UMAMI_USERNAME'),
      password,
    };
  }

  get leadsNotifyTo(): string {
    return this.get('LEADS_NOTIFY_TO');
  }

  get uploadsDir(): string {
    return this.get('UPLOADS_DIR');
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }
}
