import { describe, expect, it } from 'vitest';
import { detectImageType } from './image-type.js';

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

describe('detectImageType', () => {
  it('recognises PNG, JPEG, WebP and GIF by their signature', () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png');
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(detectImageType(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(detectImageType(ascii('GIF89a'))).toBe('gif');
    expect(detectImageType(ascii('GIF87a'))).toBe('gif');
  });

  it('rejects everything else, whatever it claims to be', () => {
    expect(detectImageType(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
    expect(detectImageType(ascii('<!doctype html><script>alert(1)</script>'))).toBeUndefined();
    expect(detectImageType(ascii('RIFF\0\0\0\0WAVEfmt '))).toBeUndefined();
    expect(detectImageType(bytes())).toBeUndefined();
  });
});
