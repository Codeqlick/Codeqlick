import { describe, expect, it } from 'vitest';
import { diskState } from './cloud-disk.service.js';

describe('Cloud disk guard', () => {
  const floors = { lowBytes: 30, minBytes: 15 };
  it('is ok above the low mark, low under it and full under the floor', () => {
    expect(diskState(100, floors)).toBe('ok');
    expect(diskState(30, floors)).toBe('ok');
    expect(diskState(29, floors)).toBe('low');
    expect(diskState(15, floors)).toBe('low');
    expect(diskState(14, floors)).toBe('full');
  });
});
