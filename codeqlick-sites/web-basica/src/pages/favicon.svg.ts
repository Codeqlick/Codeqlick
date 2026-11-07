import type { APIRoute } from 'astro';
import { site } from '../lib/site';

/** The business initial on its primary colour. Replace it with a real logo when there is one. */
export const GET: APIRoute = () => {
  const initial = site.business.name.trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${site.theme.primary}"/><text x="32" y="44" font-family="Georgia, serif" font-size="38" font-weight="700" text-anchor="middle" fill="${site.theme.primaryText}">${initial}</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
