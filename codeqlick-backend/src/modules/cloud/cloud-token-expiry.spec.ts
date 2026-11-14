import { describe, expect, it } from 'vitest';
import { tokenExpiryEmail, type TokenExpiryItem } from './cloud-emails.js';
import { groupByUser } from './cloud-token-expiry.js';
import type { TokenExpiryRow } from './cloud-tokens.repository.js';

const row = (id: string, userId: string): TokenExpiryRow => ({
  id,
  name: `Token ${id}`,
  prefix: 'cqk_abcdefgh',
  expiresAt: new Date('2026-11-17T10:00:00Z'),
  lastUsedAt: null,
  team: null,
  user: { id: userId, email: `${userId}@codeqlick.test`, name: userId, locale: 'EN' },
});

const item = (over: Partial<TokenExpiryItem> = {}): TokenExpiryItem => ({
  name: 'CI deploy',
  prefix: 'cqk_abcdefgh',
  team: null,
  expiresAt: new Date('2026-11-17T23:30:00Z'),
  lastUsedAt: new Date('2026-11-12T08:00:00Z'),
  ...over,
});

const email = (
  kind: 'soon' | 'expired',
  locale: 'en' | 'es',
  tokens: TokenExpiryItem[] = [item()],
) =>
  tokenExpiryEmail({
    to: 'ada@codeqlick.test',
    locale,
    kind,
    tokens,
    url: 'https://cloud.codeqlick.com/en/console/tokens',
    siteUrl: 'https://codeqlick.com',
  });

describe('Cloud token expiry', () => {
  it('groups tokens by person, keeping the order', () => {
    const groups = groupByUser([row('1', 'a'), row('2', 'b'), row('3', 'a')]);
    expect(groups.map((g) => [g.user.id, g.tokens.map((t) => t.id)])).toEqual([
      ['a', ['1', '3']],
      ['b', ['2']],
    ]);
    expect(groupByUser([])).toEqual([]);
  });

  it('words the subject in both languages, singular and plural', () => {
    expect(email('soon', 'en').subject).toBe('Your Codeqlick Cloud token expires soon');
    expect(email('expired', 'en').subject).toBe('Your Codeqlick Cloud token has expired');
    expect(email('soon', 'es').subject).toBe('Tu token de Codeqlick Cloud caduca pronto');
    expect(email('expired', 'es').subject).toBe('Tu token de Codeqlick Cloud ha caducado');
    const two = [item(), item({ name: 'Laptop' })];
    expect(email('soon', 'en', two).subject).toBe('2 of your Codeqlick Cloud tokens expire soon');
    expect(email('expired', 'en', two).subject).toBe(
      '2 of your Codeqlick Cloud tokens have expired',
    );
    expect(email('soon', 'es', two).subject).toBe(
      '2 de tus tokens de Codeqlick Cloud caducan pronto',
    );
    expect(email('expired', 'es', two).subject).toBe(
      '2 de tus tokens de Codeqlick Cloud han caducado',
    );
  });

  it('lists each token with its team, Madrid expiry date and last use', () => {
    const { text } = email('soon', 'en', [
      item({ name: 'CI deploy' }),
      item({ name: 'Laptop', team: 'Ops', lastUsedAt: null }),
    ]);
    expect(text).toContain('CI deploy');
    expect(text).toContain('cqk_abcdefgh…');
    expect(text).toContain('all teams');
    expect(text).toContain('Ops');
    // 23:30 UTC on the 17th is already the 18th in Madrid (UTC+1).
    expect(text).toContain('18 November 2026');
    expect(text).toContain('12 November 2026');
    expect(text).toContain('Last used: never');
    expect(text).toContain('CODEQLICK_TOKEN');
    expect(text).toContain('https://cloud.codeqlick.com/en/console/tokens');
  });

  it('writes the Spanish text and the branded HTML', () => {
    const message = email('expired', 'es', [item({ lastUsedAt: null })]);
    expect(message.text).toContain('todos los equipos');
    expect(message.text).toContain('Último uso: nunca');
    expect(message.text).toContain('18 de noviembre de 2026');
    expect(message.html).toContain('CODEQLICK_TOKEN');
  });
});
