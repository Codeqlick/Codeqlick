import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'public/neoqlick/theme.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`token ${name} not found`);
  return match[1]!;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const WHITE = '#ffffff';

/** [foreground, background, minimum ratio]: 4.5 for text, 3 for large text and icons. */
const PAIRS: [string, string, number][] = [
  ['color-brand', WHITE, 4.5],
  [WHITE, 'color-brand', 4.5],
  ['color-brand-dark', WHITE, 4.5],
  ['color-brand-dark', 'color-blush', 4.5],
  ['color-brand', 'color-blush', 4.5],
  ['color-ink', WHITE, 4.5],
  ['color-ink', 'color-blush', 4.5],
  ['color-slate', WHITE, 4.5],
  ['color-slate', 'color-blush', 4.5],
  ['color-accent-text', WHITE, 3],
  ['color-accent-text', 'color-blush', 3],
  ['color-ink', 'color-accent', 4.5],
  ['color-brand-light', 'color-night', 4.5],
  ['color-brand-light', 'color-night-card', 4.5],
  [WHITE, 'color-night', 4.5],
  ['color-muted-on-ink', 'color-night', 4.5],
  ['color-muted-on-ink', 'color-night-card', 4.5],
  ['color-accent-soft', 'color-brand', 3], // large hero text only
  [WHITE, 'color-ink', 4.5],
];

describe('Neoqlick theme contrast (WCAG AA)', () => {
  it.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, minimum) => {
    const foreground = fg.startsWith('#') ? fg : token(fg);
    const background = bg.startsWith('#') ? bg : token(bg);
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });
});
