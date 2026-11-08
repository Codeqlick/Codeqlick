import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  dHash,
  hashDistance,
  isBlockedImage,
  MAX_SIDE,
  processImage,
  watermark,
  watermarkText,
} from './swipe-image.js';
import { normalizeRef } from './swipe.schemas.js';
import { isSuspended, newRef } from './swipe.service.js';

const gradient = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 120 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width / 2}" height="${height}" fill="#fff"/></svg>`,
        ),
      },
    ])
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: 'camera' } } })
    .toBuffer();

describe('processImage', () => {
  it('resizes, drops metadata and hashes the same picture alike', async () => {
    const big = await processImage(await gradient(4000, 2000));
    expect(big).toBeDefined();
    expect(big!.width).toBe(MAX_SIDE);
    expect(big!.height).toBe(MAX_SIDE / 2);
    expect((await sharp(big!.data).metadata()).exif).toBeUndefined();

    const small = await processImage(await gradient(800, 400));
    expect(hashDistance(big!.hash, small!.hash)).toBeLessThanOrEqual(6);
    expect(isBlockedImage(small!.hash, [big!.hash])).toBe(true);
  });

  it('refuses anything that is not a PNG, JPEG or WebP image', async () => {
    expect(
      await processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeUndefined();
    expect(await processImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]))).toBeUndefined();
  });
});

describe('helpers', () => {
  it('counts differing bits', () => {
    expect(hashDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hashDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hashDistance('000000000000000f', '0000000000000000')).toBe(4);
  });

  it('makes references without look-alike characters and reads them forgivingly', () => {
    for (let i = 0; i < 50; i += 1) expect(newRef()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(normalizeRef(' #k7qm-2xpa ')).toBe('K7QM2XPA');
  });

  it('treats an ended timed suspension as over', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    expect(isSuspended(null, now)).toBe(false);
    expect(isSuspended({ suspendedAt: now, suspendedUntil: null }, now)).toBe(true);
    expect(
      isSuspended({ suspendedAt: now, suspendedUntil: new Date('2026-11-08T11:00:00Z') }, now),
    ).toBe(false);
  });
});

describe('watermark', () => {
  it('keeps the size and still matches the clean image', async () => {
    const clean = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 120, b: 160 } },
    })
      .webp()
      .toBuffer();
    const marked = await watermark(clean, watermarkText('ana', 'K7QM2XPA'));
    const info = await sharp(marked).metadata();
    expect([info.width, info.height, info.format]).toEqual([400, 300, 'webp']);
    expect(marked.equals(clean)).toBe(false);
    expect(hashDistance(await dHash(marked), await dHash(clean))).toBeLessThanOrEqual(6);
    expect(watermarkText(null, 'K7QM2XPA')).toBe('K7QM2XPA · swipe.codeqlick.com');
  });
});
