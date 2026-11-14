import { describe, expect, it } from 'vitest';
import { keptAsPreview, lockChange } from './cloud-production-lock.js';

const older = { id: 'a', createdAt: new Date('2026-11-14T10:00:00Z') };
const newer = { id: 'b', createdAt: new Date('2026-11-14T11:00:00Z') };

describe('lockChange', () => {
  it('locks when promoting a deployment older than production (a rollback)', () => {
    expect(lockChange({ kind: 'promote', current: newer, promoted: older })).toBe('lock');
  });

  it('unlocks when promoting a deployment newer than production', () => {
    expect(lockChange({ kind: 'promote', current: older, promoted: newer })).toBe('unlock');
  });

  it('unlocks when promoting another deployment exactly as old as production', () => {
    const twin = { id: 'c', createdAt: new Date(older.createdAt) };
    expect(lockChange({ kind: 'promote', current: older, promoted: twin })).toBe('unlock');
  });

  it('keeps the lock when promoting the current production again', () => {
    expect(lockChange({ kind: 'promote', current: older, promoted: { ...older } })).toBe('keep');
  });

  it('never locks without a production to compare with', () => {
    expect(lockChange({ kind: 'promote', current: null, promoted: older })).toBe('keep');
  });

  it('unlocks on an upload to production (codeqlick deploy --prod)', () => {
    expect(lockChange({ kind: 'upload' })).toBe('unlock');
  });

  it('leaves the lock alone for builds from Git', () => {
    expect(lockChange({ kind: 'build' })).toBe('keep');
  });
});

describe('keptAsPreview', () => {
  it('marks a production build that production (locked) did not take', () => {
    expect(keptAsPreview('PRODUCTION', false)).toBe(true);
  });

  it('does not mark a production build that was published', () => {
    expect(keptAsPreview('PRODUCTION', true)).toBe(false);
  });

  it('never marks a preview build', () => {
    expect(keptAsPreview('PREVIEW', false)).toBe(false);
  });
});
