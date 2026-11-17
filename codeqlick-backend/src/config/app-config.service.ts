import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';
import type { RealmName } from '../common/realm.js';
import { isNeoqlickApp, WEBAPPS, type Webapp } from '../common/webapps.js';

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

  /** Where emails are also written in tests (browser tests read them); never outside tests. */
  get mailOutboxDir(): string | undefined {
    return this.isTest ? this.get('MAIL_OUTBOX_DIR') : undefined;
  }

  get port(): number {
    return this.get('PORT');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  /** Allowed origins: CORS_ORIGINS plus Neoqlick's host when it is set (architecture 4.18). */
  get corsOrigins(): string[] {
    const configured = this.get('CORS_ORIGINS');
    const neoqlick = this.neoqlickUrl;
    return neoqlick && !configured.includes(neoqlick) ? [...configured, neoqlick] : configured;
  }

  /** Neoqlick's main host (no trailing slash); undefined where there are no Neoqlick hosts. */
  get neoqlickUrl(): string | undefined {
    return this.get('NEOQLICK_URL');
  }

  /**
   * The base URL of a realm's links in emails: the website's, or Neoqlick's (the website's again
   * while NEOQLICK_URL is unset, so staging and development keep working).
   */
  siteUrlFor(realm: RealmName): string {
    return realm === 'NEOQLICK' ? (this.neoqlickUrl ?? this.siteUrl) : this.siteUrl;
  }

  /** Neoqlick's account host: NEOQLICK_ACCOUNT_URL, or NEOQLICK_URL with `account.` before it. */
  get neoqlickAccountUrl(): string {
    const configured = this.get('NEOQLICK_ACCOUNT_URL');
    if (configured) return configured;
    const base = this.neoqlickUrl;
    return base ? base.replace('://', '://account.') : this.accountUrl;
  }

  /** The account host of a realm (links in its emails). */
  accountUrlFor(realm: RealmName): string {
    return realm === 'NEOQLICK' ? this.neoqlickAccountUrl : this.accountUrl;
  }

  /** The API as Neoqlick's emails name it (unsubscribe links). */
  get neoqlickPublicApiUrl(): string {
    return (this.get('NEOQLICK_PUBLIC_API_URL') ?? this.get('PUBLIC_API_URL')).replace(/\/+$/, '');
  }

  /** Neoqlick's sender and SMTP login; each is undefined while its mailbox isn't set up. */
  get neoqlickMail(): {
    from: string | undefined;
    user: string | undefined;
    password: string | undefined;
  } {
    return {
      from: this.get('MAIL_FROM_NEOQLICK'),
      user: this.get('SMTP_USER_NEOQLICK'),
      password: this.get('SMTP_PASSWORD_NEOQLICK'),
    };
  }

  /** Account terms version a NEOQLICK sign-up accepts. */
  get neoqlickTermsVersion(): string {
    return this.get('NEOQLICK_TERMS_VERSION');
  }

  /** Neoqlick's operator: its own variables, each falling back to the website's legal holder. */
  get neoqlickLegal(): { tradeName: string; ownerName?: string; taxId?: string; address?: string } {
    return {
      tradeName: this.get('NEOQLICK_TRADE_NAME') ?? 'Neoqlick',
      ownerName: this.get('NEOQLICK_LEGAL_OWNER_NAME') ?? this.get('LEGAL_OWNER_NAME'),
      taxId: this.get('NEOQLICK_LEGAL_OWNER_TAX_ID') ?? this.get('LEGAL_OWNER_TAX_ID'),
      address: this.get('NEOQLICK_LEGAL_OWNER_ADDRESS') ?? this.get('LEGAL_OWNER_ADDRESS'),
    };
  }

  /** Public URL of the website, without a trailing slash. */
  get siteUrl(): string {
    return this.get('SITE_URL');
  }

  /** The account host (decision 108), without a trailing slash: account.<SITE_URL's host>. */
  get accountUrl(): string {
    return this.get('ACCOUNT_URL') ?? this.siteUrl.replace('://', '://account.');
  }

  get jwtAccessSecret(): string {
    return this.get('JWT_ACCESS_SECRET');
  }

  /** Key material for project credentials; falls back to JWT_ACCESS_SECRET (see env.schema.ts). */
  get credentialsSecret(): string {
    return this.get('CREDENTIALS_SECRET') ?? this.get('JWT_ACCESS_SECRET');
  }

  /** Key of the 18+ apps' banned-email hashes (decision 120): its own, or derived from the above. */
  get adultBanHashKey(): string {
    return (
      this.get('ADULT_BAN_HASH_KEY') ??
      createHmac('sha256', this.credentialsSecret).update('adult-ban-hash-v1').digest('hex')
    );
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

  /** The site builder's URL and token; undefined while it isn't configured. */
  get siteBuilder(): { url: string; token: string } | undefined {
    const url = this.get('SITE_BUILDER_URL');
    const token = this.get('SITE_BUILDER_TOKEN');
    return url && token ? { url: url.replace(/\/+$/, ''), token } : undefined;
  }

  /** Stripe's keys for buying a preview online; undefined while it is off (decision 20). */
  get stripe(): { secretKey: string; webhookSecret: string } | undefined {
    const secretKey = this.get('STRIPE_SECRET_KEY');
    const webhookSecret = this.get('STRIPE_WEBHOOK_SECRET');
    return secretKey && webhookSecret ? { secretKey, webhookSecret } : undefined;
  }

  /** The Stripe price of Cloud's PRO plan; undefined while paid plans are off (decision 46). */
  get cloudProPriceId(): string | undefined {
    return this.stripe ? this.get('STRIPE_CLOUD_PRO_PRICE_ID') || undefined : undefined;
  }

  /** The Stripe price of the maintenance plan; undefined while the plan is off (decision 110). */
  get maintenancePriceId(): string | undefined {
    return this.stripe ? this.get('STRIPE_MAINTENANCE_PRICE_ID') || undefined : undefined;
  }

  /** Price of a website bought online, before VAT. */
  get sitePriceCents(): number {
    return this.get('SITE_PRICE_CENTS');
  }

  get siteVatPercent(): number {
    return this.get('SITE_VAT_PERCENT');
  }

  /** What a website bought online costs with VAT. */
  get siteTotalCents(): number {
    return Math.round((this.sitePriceCents * (100 + this.siteVatPercent)) / 100);
  }

  get sitesPreviewDomain(): string {
    return this.get('SITES_PREVIEW_DOMAIN');
  }

  /** Cloud's static hosting (architecture 4.13, 8.3); undefined while it isn't set up. */
  get cloudHosting(): { domain: string; root: string } | undefined {
    const domain = this.get('CLOUD_HOSTING_DOMAIN')?.toLowerCase().replace(/\.+$/, '');
    const root = this.get('CLOUD_ROOT');
    return domain && root ? { domain, root } : undefined;
  }

  /** The key Nginx sends to the password-protection routes (architecture 4.13); undefined: off. */
  get cloudProtectionKey(): string | undefined {
    return this.get('CLOUD_PROTECTION_KEY');
  }

  /** Exact domains the platform team may use under codeqlick.com (lowercase, trimmed; none if unset). */
  get cloudPlatformDomains(): string[] {
    return (this.get('CLOUD_PLATFORM_DOMAINS') ?? '')
      .split(',')
      .map((domain) => domain.trim().toLowerCase().replace(/\.+$/, ''))
      .filter(Boolean);
  }

  /** Id of the team allowed those domains; undefined while it isn't set. */
  get cloudPlatformTeamId(): string | undefined {
    return this.get('CLOUD_PLATFORM_TEAM_ID')?.trim() || undefined;
  }

  /** Managed PostgreSQL (architecture 4.13 "Databases"); undefined while it isn't set up. */
  get cloudPg(): { adminUrl: string; host: string; port: number } | undefined {
    const adminUrl = this.get('CLOUD_PG_ADMIN_URL');
    const host = this.get('CLOUD_PG_HOST');
    return adminUrl && host ? { adminUrl, host, port: this.get('CLOUD_PG_PORT') } : undefined;
  }

  /** Object storage (architecture 4.13 "Object storage"); undefined while it isn't set up. */
  get cloudStorage():
    | { adminUrl: string; token: string; endpoint: string; region: string; capacityGb: number }
    | undefined {
    const adminUrl = this.get('CLOUD_STORAGE_ADMIN_URL')?.replace(/\/+$/, '');
    const token = this.get('CLOUD_STORAGE_ADMIN_TOKEN');
    const endpoint = this.get('CLOUD_STORAGE_ENDPOINT')?.replace(/\/+$/, '');
    return adminUrl && token && endpoint
      ? {
          adminUrl,
          token,
          endpoint,
          region: this.get('CLOUD_STORAGE_REGION'),
          capacityGb: this.get('CLOUD_STORAGE_CAPACITY_GB'),
        }
      : undefined;
  }

  /** Free space floors of the disk guard, in bytes (decision 49). */
  get cloudDisk(): { lowBytes: number; minBytes: number } {
    const gb = 1024 ** 3;
    return {
      lowBytes: this.get('CLOUD_DISK_LOW_GB') * gb,
      minBytes: this.get('CLOUD_DISK_MIN_GB') * gb,
    };
  }

  /** Cloud's GitHub App, when all its settings are there (architecture 4.13, Builds from Git). */
  get githubApp():
    | {
        appId: string;
        slug: string;
        clientId: string;
        clientSecret: string;
        privateKey: string;
        webhookSecret: string;
      }
    | undefined {
    const appId = this.get('GITHUB_APP_ID');
    const slug = this.get('GITHUB_APP_SLUG');
    const clientId = this.get('GITHUB_APP_CLIENT_ID');
    const clientSecret = this.get('GITHUB_APP_CLIENT_SECRET');
    const privateKey = this.get('GITHUB_APP_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    const webhookSecret = this.get('GITHUB_APP_WEBHOOK_SECRET');
    return appId && slug && clientId && clientSecret && privateKey && webhookSecret
      ? { appId, slug, clientId, clientSecret, privateKey, webhookSecret }
      : undefined;
  }

  get cloudBuilderToken(): string | undefined {
    return this.get('CLOUD_BUILDER_TOKEN');
  }

  get cloudUrl(): string {
    return this.get('CLOUD_URL').replace(/\/+$/, '');
  }

  get publicApiUrl(): string {
    return this.get('PUBLIC_API_URL').replace(/\/+$/, '');
  }

  /** Umami's API without a website (managed client sites have their own); undefined when off. */
  get umamiApi(): { url: string; username: string; password: string } | undefined {
    const url = this.get('UMAMI_URL');
    const password = this.get('UMAMI_PASSWORD');
    if (!url || !password) return undefined;
    return { url: url.replace(/\/+$/, ''), username: this.get('UMAMI_USERNAME'), password };
  }

  /** OVH's API with the team's keys; undefined until all three are set. */
  get ovh():
    { endpoint: string; appKey: string; appSecret: string; consumerKey: string } | undefined {
    const appKey = this.get('OVH_APPLICATION_KEY');
    const appSecret = this.get('OVH_APPLICATION_SECRET');
    const consumerKey = this.get('OVH_CONSUMER_KEY');
    if (!appKey || !appSecret || !consumerKey) return undefined;
    return {
      endpoint: this.get('OVH_ENDPOINT').replace(/\/+$/, ''),
      appKey,
      appSecret,
      consumerKey,
    };
  }

  get ovhNicHandle(): string | undefined {
    return this.get('OVH_NIC_HANDLE');
  }

  get sitesServerIp(): string | undefined {
    return this.get('SITES_SERVER_IP');
  }

  get umamiScriptUrl(): string {
    return this.get('UMAMI_SCRIPT_URL');
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

  /** Passkeys' relying party ID (decision 104): `codeqlick.com` in production. */
  get webauthnRpId(): string {
    return this.get('WEBAUTHN_RP_ID') ?? (this.isProduction ? 'codeqlick.com' : 'localhost');
  }

  /** The relying party of a realm's passkeys (architecture 4.18). */
  webauthnRpIdFor(realm: RealmName): string {
    if (realm === 'CODEQLICK') return this.webauthnRpId;
    return (
      this.get('WEBAUTHN_RP_ID_NEOQLICK') ?? (this.isProduction ? 'neoqlick.com' : 'localhost')
    );
  }

  /** Origins a realm's passkey ceremonies may come from. */
  webauthnOriginsFor(realm: RealmName): string[] {
    if (realm === 'CODEQLICK') return this.webauthnOrigins;
    const configured = (this.get('WEBAUTHN_ORIGINS_NEOQLICK') ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter((origin) => origin.length > 0);
    if (configured.length > 0) return configured;
    return [
      ...new Set([
        this.siteUrlFor('NEOQLICK'),
        this.neoqlickAccountUrl,
        ...WEBAPPS.filter(isNeoqlickApp).map((app) => this.webappUrl(app)),
      ]),
    ];
  }

  /** Origins a Codeqlick passkey ceremony may come from: the website and every web app's host. */
  get webauthnOrigins(): string[] {
    const configured = (this.get('WEBAUTHN_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter((origin) => origin.length > 0);
    if (configured.length > 0) return configured;
    return [
      ...new Set([this.siteUrl, this.accountUrl, ...WEBAPPS.map((app) => this.webappUrl(app))]),
    ];
  }

  get adminTwoFactorRequired(): boolean {
    return this.get('ADMIN_TWO_FACTOR_REQUIRED');
  }

  get passwordBreachCheck(): boolean {
    return this.get('PASSWORD_BREACH_CHECK');
  }

  get leadsNotifyTo(): string {
    return this.get('LEADS_NOTIFY_TO');
  }

  get uploadsDir(): string {
    return this.get('UPLOADS_DIR');
  }

  get swipeUploadsDir(): string {
    return this.get('SWIPE_UPLOADS_DIR');
  }

  /** Cruising's photos and videos (architecture 4.15, phase 4). */
  get cruisingUploadsDir(): string {
    return this.get('CRUISING_UPLOADS_DIR');
  }

  /** Version of Cruising's rules and terms (architecture 4.15). */
  get cruisingTermsVersion(): string {
    return this.get('CRUISING_TERMS_VERSION');
  }

  /** Origins allowed to open the video chat's WebSocket. */
  get videochatOrigins(): string[] {
    const configured = this.get('VIDEOCHAT_ORIGINS');
    // Neoqlick's video chat follows NEOQLICK_URL, like CORS (architecture 4.18).
    const neoqlick = this.neoqlickUrl?.replace('://', '://videochat.');
    return neoqlick && !configured.includes(neoqlick) ? [...configured, neoqlick] : configured;
  }

  /** The video chat needs a verified age (not only a declared one). */
  get videochatAgeVerificationRequired(): boolean {
    return this.get('VIDEOCHAT_AGE_VERIFICATION_REQUIRED');
  }

  /** Origins allowed to open the meetings' WebSocket. */
  get meetingsOrigins(): string[] {
    return this.get('MEETINGS_ORIGINS');
  }

  /**
   * A web app's public URL (architecture 6.3): the first of its WebSocket's allowed origins, or the
   * site's address with the app's subdomain (`https://citas.codeqlick.com`).
   */
  webappUrl(app: Webapp): string {
    // Neoqlick's apps live under Neoqlick's host (4.18) when it is set.
    if (isNeoqlickApp(app)) {
      const neoqlick = this.siteUrlFor('NEOQLICK');
      return app === 'videochat' && !this.neoqlickUrl
        ? (this.videochatOrigins[0] ?? neoqlick.replace('://', `://${app}.`))
        : neoqlick.replace('://', `://${app}.`);
    }
    return (
      (app === 'meetings' ? this.meetingsOrigins[0] : undefined) ??
      this.siteUrl.replace('://', `://${app}.`)
    );
  }

  /** STUN/TURN for calls (video chat, meetings): the URLs and coturn's shared secret (TURN needs both). */
  get turn(): { urls: string[]; secret: string | undefined } {
    const urls = (this.get('TURN_URLS') ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
    return { urls, secret: this.get('TURN_SECRET') };
  }

  /** Web Push for the video chat's notifications, when both VAPID keys are set. */
  get vapid(): { publicKey: string; privateKey: string; subject: string } | undefined {
    const publicKey = this.get('VAPID_PUBLIC_KEY');
    const privateKey = this.get('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) return undefined;
    return { publicKey, privateKey, subject: this.get('VAPID_SUBJECT') };
  }

  /**
   * Web Push key pair of the 18+ apps (architecture 4.18): Neoqlick's own when both keys are set,
   * otherwise Codeqlick's, so push keeps working until Neoqlick's pair exists.
   */
  get neoqlickVapid(): { publicKey: string; privateKey: string; subject: string } | undefined {
    const publicKey = this.get('NEOQLICK_VAPID_PUBLIC_KEY');
    const privateKey = this.get('NEOQLICK_VAPID_PRIVATE_KEY');
    if (publicKey && privateKey) {
      return { publicKey, privateKey, subject: this.get('NEOQLICK_VAPID_SUBJECT') };
    }
    return this.vapid;
  }

  /** Cloudflare Turnstile's secret key (architecture 4.3); undefined: no check. */
  get turnstileSecret(): string | undefined {
    return this.get('TURNSTILE_SECRET_KEY');
  }

  /**
   * The Turnstile secret of a realm (architecture 4.18): Neoqlick has a widget in its own
   * Cloudflare account, so it never falls back to Codeqlick's secret (every token would fail).
   * Undefined: no check for that realm.
   */
  turnstileSecretFor(realm: RealmName): string | undefined {
    return realm === 'NEOQLICK' ? this.get('TURNSTILE_SECRET_KEY_NEOQLICK') : this.turnstileSecret;
  }

  /** Google PageSpeed Insights' key for the website check (architecture 4.12); undefined: off. */
  get pageSpeedApiKey(): string | undefined {
    return this.get('PAGESPEED_API_KEY');
  }

  /** IndexNow submissions and the key route (architecture 4.1, IndexNow); off unless true. */
  get indexNowEnabled(): boolean {
    return this.get('INDEXNOW_ENABLED');
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }
}
