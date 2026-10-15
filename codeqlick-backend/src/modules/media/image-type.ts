/** Image formats accepted for uploads. SVG is left out on purpose: it can carry scripts. */
export const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} as const;

export type ImageExtension = keyof typeof IMAGE_TYPES;

function startsWith(data: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => data[offset + index] === byte);
}

/**
 * Detects the format from the file's first bytes. The client's file name and Content-Type are
 * never trusted: they decide nothing about how the file is stored or served.
 */
export function detectImageType(data: Uint8Array): ImageExtension | undefined {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'jpg';
  // "RIFF" <size> "WEBP"
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'webp';
  }
  // "GIF87a" or "GIF89a"
  if (startsWith(data, [0x47, 0x49, 0x46, 0x38]) && (data[4] === 0x37 || data[4] === 0x39)) {
    return 'gif';
  }
  return undefined;
}
