import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { availableFromOffers, ovhSignature, zonePlan, type ZoneRecord } from './ovh.js';

const MINUTE_MS = 60_000;
const DOMAINS_TTL_MS = 10 * MINUTE_MS;
const CART_TTL_MS = 12 * 60 * MINUTE_MS;

/**
 * OVH's API with the team's keys (architecture 8.2): availability through an order cart, and the
 * domains whose technical contact is the team (their expiry and DNS zone). Signed requests, no SDK.
 */
@Injectable()
export class OvhClient {
  private readonly logger = new Logger(OvhClient.name);
  private timeDelta: number | undefined;
  private domains: { names: Set<string>; at: number } | undefined;
  private cart: { id: string; at: number } | undefined;

  constructor(private readonly config: AppConfigService) {}

  get configured(): boolean {
    return this.config.ovh !== undefined;
  }

  /** Whether OVH would register the domain now; null when it doesn't say. */
  async available(domain: string): Promise<boolean | null> {
    const cartId = await this.cartId();
    try {
      return availableFromOffers(
        await this.request(
          'GET',
          `/order/cart/${cartId}/domain?domain=${encodeURIComponent(domain)}`,
        ),
      );
    } catch (error) {
      // An expired cart: start a new one next time.
      this.cart = undefined;
      throw error;
    }
  }

  /** Whether the domain is one the team's account manages (it is its technical contact). */
  async manages(domain: string): Promise<boolean> {
    if (!this.domains || Date.now() - this.domains.at > DOMAINS_TTL_MS) {
      const names = (await this.request('GET', '/domain')) as string[];
      this.domains = { names: new Set(names.map((name) => name.toLowerCase())), at: Date.now() };
    }
    return this.domains.names.has(domain);
  }

  /** The domain's expiry (`yyyy-mm-dd`), from its service information. */
  async expiry(domain: string): Promise<string | null> {
    const info = (await this.request('GET', `/domain/${domain}/serviceInfos`)) as {
      expiration?: string;
    };
    return info.expiration && /^\d{4}-\d{2}-\d{2}/.test(info.expiration)
      ? info.expiration.slice(0, 10)
      : null;
  }

  /**
   * Points the apex and `www` of the domain's zone at `ip` (A records), leaving every other
   * record alone; true when something changed.
   */
  async pointAt(domain: string, ip: string): Promise<boolean> {
    const base = `/domain/zone/${domain}/record`;
    const records: ZoneRecord[] = [];
    // By type (an empty subDomain filter would list the whole zone); zonePlan keeps @ and www.
    for (const type of ['A', 'AAAA', 'CNAME']) {
      const ids = (await this.request('GET', `${base}?fieldType=${type}`)) as number[];
      for (const id of ids)
        records.push((await this.request('GET', `${base}/${id}`)) as ZoneRecord);
    }
    const plan = zonePlan(domain, records, ip);
    if (plan.create.length === 0) return false;
    for (const id of plan.remove) await this.request('DELETE', `${base}/${id}`);
    for (const subDomain of plan.create) {
      await this.request('POST', base, { fieldType: 'A', subDomain, target: ip, ttl: 3600 });
    }
    await this.request('POST', `/domain/zone/${domain}/refresh`);
    return true;
  }

  private async cartId(): Promise<string> {
    if (this.cart && Date.now() - this.cart.at < CART_TTL_MS) return this.cart.id;
    const cart = (await this.request('POST', '/order/cart', { ovhSubsidiary: 'ES' })) as {
      cartId: string;
    };
    this.cart = { id: cart.cartId, at: Date.now() };
    return cart.cartId;
  }

  /** OVH's clock minus ours, in seconds (signatures carry OVH's time). */
  private async delta(endpoint: string): Promise<number> {
    if (this.timeDelta === undefined) {
      const response = await fetch(`${endpoint}/auth/time`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`OVH /auth/time answered ${response.status}`);
      this.timeDelta = Number(await response.text()) - Math.floor(Date.now() / 1000);
    }
    return this.timeDelta;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const ovh = this.config.ovh;
    if (!ovh) throw new Error('OVH is not configured');
    const url = `${ovh.endpoint}${path}`;
    const text = body === undefined ? '' : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000) + (await this.delta(ovh.endpoint));
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Ovh-Application': ovh.appKey,
        'X-Ovh-Consumer': ovh.consumerKey,
        'X-Ovh-Timestamp': String(timestamp),
        'X-Ovh-Signature': ovhSignature({
          appSecret: ovh.appSecret,
          consumerKey: ovh.consumerKey,
          method,
          url,
          body: text,
          timestamp,
        }),
      },
      ...(text ? { body: text } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const answer = await response.text();
    if (!response.ok) {
      this.logger.warn(
        `OVH ${method} ${path} answered ${response.status}: ${answer.slice(0, 200)}`,
      );
      throw new Error(`OVH answered ${response.status}`);
    }
    return answer ? (JSON.parse(answer) as unknown) : null;
  }
}
