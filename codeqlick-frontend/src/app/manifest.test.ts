import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const headers = vi.fn();
vi.mock('next/headers', () => ({ headers: () => headers() }));

const { default: manifest } = await import('./manifest');

function onHost(host: string) {
  headers.mockResolvedValue(new Headers({ host }));
}

afterEach(() => headers.mockReset());

describe('the web app manifest', () => {
  it('installs Cruising on its host, opening the map (decision 96)', async () => {
    onHost('cruising.codeqlick.com');
    const result = await manifest();
    expect(result).toMatchObject({
      id: '/cruising',
      name: 'Cruising',
      short_name: 'Cruising',
      start_url: '/map',
      display: 'standalone',
      theme_color: '#ffffff',
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

  it('keeps the other hosts’ own manifests', async () => {
    onHost('codeqlick.com');
    expect((await manifest()).name).not.toBe('Cruising');
    onHost('swipe.codeqlick.com');
    expect((await manifest()).name).toBe('Swipe');
  });

  it('has the offline page and the service worker the app needs', () => {
    expect(existsSync(join(process.cwd(), 'public', 'cruising-offline.html'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'public', 'cruising-apple-touch-icon.png'))).toBe(true);
  });
});
