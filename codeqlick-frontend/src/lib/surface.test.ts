import type { SurfaceChange } from '@/lib/api/cloud';
import { describe, expect, it } from 'vitest';
import {
  checkTitle,
  describeSurfaceChange,
  gradeBadgeTone,
  gradeBand,
  scanIdParam,
  scanMark,
} from './surface';

describe('grades', () => {
  it('bands the grade', () => {
    expect(gradeBand('A+')).toBe('good');
    expect(gradeBand('B')).toBe('good');
    expect(gradeBand('C')).toBe('fair');
    expect(gradeBand('F')).toBe('poor');
    expect(gradeBand(null)).toBe('poor');
  });
  it('maps the band to a badge tone', () => {
    expect(gradeBadgeTone('A')).toBe('success');
    expect(gradeBadgeTone('D')).toBe('warning');
    expect(gradeBadgeTone('E')).toBe('danger');
  });
});

describe('describeSurfaceChange', () => {
  const titleOf = (id: string) => (id === 'hsts' ? 'HSTS' : null);
  it('names a check by its title, falling back to the id', () => {
    const worse = { kind: 'check', id: 'hsts', from: 'pass', to: 'fail' } as const;
    expect(describeSurfaceChange(worse, titleOf).values).toEqual({
      title: 'HSTS',
      from: 'pass',
      to: 'fail',
    });
    expect(describeSurfaceChange({ ...worse, id: 'csp' }, titleOf).values.title).toBe('csp');
  });
  it('maps a certificate crossing a threshold', () => {
    const out = describeSurfaceChange({ kind: 'cert_expiry', threshold: 7, days: 5 }, titleOf);
    expect(out.key).toBe('certExpiry');
    expect(out.values).toEqual({ days: 5, threshold: 7 });
  });
  it('maps an issuer change', () => {
    const out = describeSurfaceChange({ kind: 'cert_issuer', from: 'A', to: 'B' }, titleOf);
    expect(out).toMatchObject({ key: 'certIssuer', values: { from: 'A', to: 'B' } });
  });
  it('keeps what a records change added and removed', () => {
    const out = describeSurfaceChange(
      { kind: 'records', record: 'spf', added: ['v=spf1 -all'], removed: ['v=spf1 +all'] },
      titleOf,
    );
    expect(out).toMatchObject({
      key: 'records',
      values: { record: 'spf' },
      added: ['v=spf1 -all'],
      removed: ['v=spf1 +all'],
    });
  });
  it('carries the values left out, 0 when the API sends none', () => {
    const records: SurfaceChange = { kind: 'records', record: 'mx', added: ['a'], removed: [] };
    expect(describeSurfaceChange(records, titleOf).more).toBe(0);
    expect(describeSurfaceChange({ ...records, more: 4 } as SurfaceChange, titleOf).more).toBe(4);
    expect(describeSurfaceChange({ kind: 'libs', added: ['x'], more: 2 }, titleOf).more).toBe(2);
  });
  it('counts the new vulnerable libraries', () => {
    const out = describeSurfaceChange({ kind: 'libs', added: ['jquery 1.12.4', 'x 1'] }, titleOf);
    expect(out).toMatchObject({ key: 'libs', values: { count: 2 }, removed: [] });
  });
});

describe('checkTitle', () => {
  it('finds a title across groups', () => {
    const groups = [{ checks: [{ id: 'a', title: 'A' }] }, { checks: [{ id: 'b', title: 'B' }] }];
    expect(checkTitle(groups, 'b')).toBe('B');
    expect(checkTitle(groups, 'z')).toBeNull();
  });
});

describe('scanMark', () => {
  it('marks failed scans and scans with changes', () => {
    expect(scanMark({ status: 'FAILED', changes: 0 })).toBe('failed');
    expect(scanMark({ status: 'DONE', changes: 2 })).toBe('changes');
    expect(scanMark({ status: 'DONE', changes: 0 })).toBeNull();
  });
});

describe('scanIdParam', () => {
  it('accepts only a UUID', () => {
    const id = '0b8f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    expect(scanIdParam(id)).toBe(id);
    expect(scanIdParam([id, 'x'])).toBe(id);
    expect(scanIdParam('../x')).toBeNull();
    expect(scanIdParam(undefined)).toBeNull();
  });
});
