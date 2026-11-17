import 'server-only';
import { headers } from 'next/headers';
import { BRANDS, type BrandConfig } from './brand';
import { brandOfHost, classifyHost, type Brand, type HostClass } from './hosts';

/** The visitor's host (behind Nginx and Server Actions' own fetches `X-Forwarded-Host` has it). */
export async function requestHost(): Promise<string | null> {
  const incoming = await headers();
  return incoming.get('x-forwarded-host')?.split(',')[0]?.trim() || incoming.get('host');
}

/** The brand of the request's host (`neoqlick` on Neoqlick's hosts, else `codeqlick`). */
export async function requestBrand(): Promise<Brand> {
  return brandOfHost(await requestHost());
}

/** The brand's constants (name, contact, icons) of the request's host. */
export async function requestBrandConfig(): Promise<BrandConfig> {
  return BRANDS[await requestBrand()];
}

/** Brand and kind (site, app, account, portal) of the request's host. */
export async function requestHostClass(): Promise<HostClass> {
  return classifyHost(await requestHost());
}
