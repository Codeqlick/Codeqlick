import { describe, expect, it } from 'vitest';
import { localMediaPath } from './media-path';

const SITE = 'https://codeqlick.com';
const FILE = '8f93f772-e5c0-41f4-9ab4-bdeaa7c8c97b.jpg';

describe('localMediaPath', () => {
  it('returns the path of our own uploads, absolute or relative', () => {
    expect(localMediaPath(`${SITE}/media/${FILE}`, SITE)).toBe(`/media/${FILE}`);
    expect(localMediaPath(`/media/${FILE}`, SITE)).toBe(`/media/${FILE}`);
  });

  it('ignores other sites, other paths and names the API never generates', () => {
    expect(localMediaPath(`https://example.com/media/${FILE}`, SITE)).toBeNull();
    expect(localMediaPath(`${SITE}/uploads/${FILE}`, SITE)).toBeNull();
    expect(localMediaPath(`${SITE}/media/photo.jpg`, SITE)).toBeNull();
    expect(localMediaPath(`${SITE}/media/${FILE}?w=10`, SITE)).toBeNull();
    expect(localMediaPath('http://[bad', SITE)).toBeNull();
  });
});
