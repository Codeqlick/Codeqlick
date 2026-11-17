import type { Brand } from './hosts';

/**
 * The Turnstile site key of a brand (architecture 4.18): Neoqlick's widget lives in its own
 * Cloudflare account, so its hosts never show Codeqlick's key; without Neoqlick's, no widget (the
 * API then runs no check for that realm either).
 */
export function turnstileSiteKey(
  brand: Brand,
  keys: { codeqlick?: string; neoqlick?: string },
): string | undefined {
  return brand === 'neoqlick' ? keys.neoqlick : keys.codeqlick;
}
