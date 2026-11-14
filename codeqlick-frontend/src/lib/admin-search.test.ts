import { describe, expect, it } from 'vitest';
import { ADMIN_SEARCH_KINDS } from '@/lib/api/types';
import {
  adminSearchHref,
  adminSearchQuery,
  isApplePlatform,
  moveActiveIndex,
} from './admin-search';

const ID = '3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b';

describe('adminSearchHref', () => {
  it('opens each kind on its admin page (architecture 4.14)', () => {
    expect(adminSearchHref('lead', ID)).toBe(`/admin/leads/${ID}`);
    expect(adminSearchHref('user', ID)).toBe(`/admin/users/${ID}`);
    expect(adminSearchHref('project', ID)).toBe(`/admin/projects/${ID}`);
    expect(adminSearchHref('ticket', ID)).toBe(`/admin/support/${ID}`);
    expect(adminSearchHref('proposal', ID)).toBe(`/admin/proposals/${ID}`);
    expect(adminSearchHref('post', ID)).toBe(`/admin/posts/${ID}`);
    expect(adminSearchHref('caseStudy', ID)).toBe(`/admin/portfolio/${ID}`);
  });

  it('leaves the locale prefix to the locale-aware router', () => {
    for (const kind of ADMIN_SEARCH_KINDS) {
      const href = adminSearchHref(kind, ID);
      expect(href.startsWith('/admin/'), kind).toBe(true);
      expect(href).not.toMatch(/^\/(en|es)\//);
    }
  });

  it('keeps an odd id inside its path segment', () => {
    expect(adminSearchHref('lead', '../users/x?y')).toBe('/admin/leads/..%2Fusers%2Fx%3Fy');
  });
});

describe('adminSearchQuery', () => {
  it('trims and accepts 2 to 100 characters', () => {
    expect(adminSearchQuery('  ana  ')).toBe('ana');
    expect(adminSearchQuery('#12')).toBe('#12');
    expect(adminSearchQuery('ab')).toBe('ab');
    expect(adminSearchQuery('x'.repeat(100))).toBe('x'.repeat(100));
  });

  it('refuses shorter, longer or missing queries', () => {
    expect(adminSearchQuery(' a ')).toBeNull();
    expect(adminSearchQuery('')).toBeNull();
    expect(adminSearchQuery(null)).toBeNull();
    expect(adminSearchQuery(undefined)).toBeNull();
    expect(adminSearchQuery('x'.repeat(101))).toBeNull();
  });
});

describe('moveActiveIndex', () => {
  it('moves down and up, wrapping at both ends', () => {
    expect(moveActiveIndex(0, 1, 3)).toBe(1);
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(1, -1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
  });

  it('starts from the first (down) or the last (up) when nothing is highlighted', () => {
    expect(moveActiveIndex(-1, 1, 4)).toBe(0);
    expect(moveActiveIndex(-1, -1, 4)).toBe(3);
    expect(moveActiveIndex(9, 1, 4)).toBe(0);
  });

  it('highlights nothing without options', () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
    expect(moveActiveIndex(-1, -1, 0)).toBe(-1);
  });

  it('stays on the only option', () => {
    expect(moveActiveIndex(0, 1, 1)).toBe(0);
    expect(moveActiveIndex(0, -1, 1)).toBe(0);
  });
});

describe('isApplePlatform', () => {
  it('tells Apple devices apart', () => {
    expect(isApplePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe(true);
    expect(isApplePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(isApplePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isApplePlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });
});
