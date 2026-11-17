import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const headers = vi.fn();
vi.mock('next/headers', () => ({ headers: () => headers() }));

const { default: manifest } = await import('./manifest');

function onHost(host: string) {
  headers.mockResolvedValue(new Headers({ host }));
}

afterEach(() => {
  headers.mockReset();
  vi.unstubAllEnvs();
});

describe('the web app manifest', () => {
  it('installs Cruising on its host, opening the map (decision 96)', async () => {
    vi.stubEnv('NEOQLICK_URL', 'https://neoqlick.com');
    onHost('cruising.neoqlick.com');
    const result = await manifest();
    expect(result).toMatchObject({
      id: '/cruising',
      name: 'Cruising',
      short_name: 'Cruising',
      start_url: '/map',
      display: 'standalone',
      theme_color: '#7c3aed',
    });
    const icons = result.icons ?? [];
    expect(icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '192x192 maskable',
      '512x512 maskable',
    ]);
    // The icons exist in public/.
    for (const icon of icons) {
      expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true);
    }
  });

  it('keeps the website’s own manifest on its host, and Neoqlick’s apps’ on its hosts', async () => {
    vi.stubEnv('NEOQLICK_URL', 'https://neoqlick.com');
    onHost('codeqlick.com');
    expect((await manifest()).name).toBe('Codeqlick');
    onHost('swipe.neoqlick.com');
    expect((await manifest()).name).toBe('Swipe');
    onHost('videochat.neoqlick.com');
    expect((await manifest()).name).toBe('Neoqlick Videochat');
  });

  it('is Neoqlick’s, with no Codeqlick, on its portal and account hosts', async () => {
    vi.stubEnv('NEOQLICK_URL', 'https://neoqlick.com');
    for (const host of [
      'neoqlick.com',
      'account.neoqlick.com',
      'cruising.neoqlick.com',
      'swipe.neoqlick.com',
      'videochat.neoqlick.com',
    ]) {
      onHost(host);
      const result = await manifest();
      expect(JSON.stringify(result), host).not.toMatch(/codeqlick/i);
      expect(result.theme_color, host).toBe('#7c3aed');
      for (const icon of result.icons ?? []) {
        expect(icon.src, host).toMatch(/^\/neoqlick\//);
      }
    }
  });

  it('has the offline page the app needs', () => {
    expect(existsSync(join(process.cwd(), 'public', 'cruising-offline.html'))).toBe(true);
    expect(
      existsSync(join(process.cwd(), 'public', 'neoqlick', 'png', 'apple-touch-icon.png')),
    ).toBe(true);
  });
});
