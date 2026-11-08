import sharp from 'sharp';
import { detectImageType } from '../media/image-type.js';

/** Longest side of a stored photo, in pixels. */
export const MAX_SIDE = 1600;
/** Hashes this close (differing bits of 64) are taken as the same image. */
export const SAME_IMAGE_DISTANCE = 6;
/** Images larger than this many pixels are refused before decoding (decompression bombs). */
const MAX_INPUT_PIXELS = 50_000_000;

export interface ProcessedImage {
  /** WebP, without any metadata (EXIF, location, camera). */
  data: Buffer;
  width: number;
  height: number;
  /** dHash of the image, 16 hex digits. */
  hash: string;
}

/**
 * Re-encodes an uploaded photo: the orientation is applied, it is resized to at most MAX_SIDE and
 * saved as WebP, which drops every metadata field. Returns undefined for anything that isn't a
 * PNG, JPEG or WebP image that can be decoded.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage | undefined> {
  const type = detectImageType(input);
  if (type !== 'png' && type !== 'jpg' && type !== 'webp') return undefined;
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, hash: await dHash(data) };
  } catch {
    return undefined;
  }
}

/**
 * Difference hash: the image as 9×8 greys, one bit per pixel brighter than its right neighbour.
 * Survives resizing and re-compression, so a removed image uploaded again is recognised.
 */
export async function dHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = pixels[row * 9 + col] ?? 0;
      const right = pixels[row * 9 + col + 1] ?? 0;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

/** Bits that differ between two hashes. */
export function hashDistance(a: string, b: string): number {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let bits = 0;
  while (value > 0n) {
    bits += Number(value & 1n);
    value >>= 1n;
  }
  return bits;
}

/** Whether `hash` looks like one of `blocked`. */
export function isBlockedImage(hash: string, blocked: readonly string[]): boolean {
  return blocked.some((other) => hashDistance(hash, other) <= SAME_IMAGE_DISTANCE);
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Burns `text` (nickname · ref · swipe.codeqlick.com) into the bottom right corner of a stored
 * photo, white with a dark outline so it reads on any background. Returns the new WebP.
 */
export async function watermark(image: Buffer, text: string): Promise<Buffer> {
  const { width = 800, height = 800 } = await sharp(image).metadata();
  const size = Math.max(14, Math.round(Math.min(width, height) / 32));
  const margin = Math.round(size * 0.8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<text x="${width - margin}" y="${height - margin}" text-anchor="end" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="bold" fill="#ffffff" fill-opacity="0.8" stroke="#000000" stroke-opacity="0.55" stroke-width="${Math.max(1, Math.round(size / 10))}" paint-order="stroke">${escapeXml(text)}</text>
</svg>`;
  return sharp(image)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 82 })
    .toBuffer();
}

/** The watermark's text for a photo. */
export function watermarkText(nickname: string | null | undefined, ref: string): string {
  return `${nickname ? `@${nickname} · ` : ''}${ref} · swipe.codeqlick.com`;
}
