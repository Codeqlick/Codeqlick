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
