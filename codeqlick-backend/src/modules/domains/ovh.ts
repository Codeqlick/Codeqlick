import { createHash } from 'node:crypto';

/** OVH's request signature: `$1$` + SHA-1 of secret, consumer key, method, URL, body and time. */
export function ovhSignature(input: {
  appSecret: string;
  consumerKey: string;
  method: string;
  url: string;
  body: string;
  timestamp: number;
}): string {
  const text = [
    input.appSecret,
    input.consumerKey,
    input.method,
    input.url,
    input.body,
    input.timestamp,
  ].join('+');
  return `$1$${createHash('sha1').update(text).digest('hex')}`;
}

/** An offer of `GET /order/cart/{id}/domain`: what OVH would do with the name. */
export interface OvhDomainOffer {
  action?: string;
  orderable?: boolean;
}

/** Free when OVH offers to create it; taken when it only offers a transfer (or nothing). */
export function availableFromOffers(offers: unknown): boolean | null {
  if (!Array.isArray(offers)) return null;
  const list = offers as OvhDomainOffer[];
  if (list.some((offer) => offer.action === 'create' && offer.orderable)) return true;
  if (list.some((offer) => offer.action === 'transfer' || offer.action === 'create')) return false;
  return null;
}

/** A record of a DNS zone (`GET /domain/zone/{name}/record/{id}`). */
export interface ZoneRecord {
  id: number;
  fieldType: string;
  subDomain: string;
  target: string;
}

/**
 * What to change so that the apex and `www` of a zone point at `ip`: the A, AAAA and CNAME
 * records of those two names to delete and the A records to create. `www` may stay a CNAME to the
 * apex. Nothing to do when both already resolve to `ip` alone.
 */
export function zonePlan(
  domain: string,
  records: ZoneRecord[],
  ip: string,
): { remove: number[]; create: string[] } {
  const plan = { remove: [] as number[], create: [] as string[] };
  for (const sub of ['', 'www']) {
    const own = records.filter(
      (record) => record.subDomain === sub && ['A', 'AAAA', 'CNAME'].includes(record.fieldType),
    );
    const fine =
      (own.length === 1 && own[0]!.fieldType === 'A' && own[0]!.target === ip) ||
      (sub === 'www' &&
        own.length === 1 &&
        own[0]!.fieldType === 'CNAME' &&
        own[0]!.target.replace(/\.$/, '') === domain);
    if (fine) continue;
    plan.remove.push(...own.map((record) => record.id));
    plan.create.push(sub);
  }
  return plan;
}
