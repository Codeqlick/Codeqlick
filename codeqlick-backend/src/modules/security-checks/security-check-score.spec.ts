import { describe, expect, it } from 'vitest';
import { gradeChecks, gradeOf, scoreOf, WEIGHTS } from './security-check-score.js';
import {
  CHECK_GROUP,
  type CheckGroup,
  type CheckId,
  type CheckResult,
  type CheckStatus,
} from './security-check-types.js';

const ids = Object.keys(CHECK_GROUP) as CheckId[];

/** Every check with `status`, except the ones in `overrides`. */
function checks(status: CheckStatus, overrides: Partial<Record<CheckId, CheckStatus>> = {}) {
  return ids.map((id): CheckResult => ({ id, status: overrides[id] ?? status, values: {} }));
}

describe('weights', () => {
  it('add up to 100 in the groups of the spec', () => {
    const total = (group: CheckGroup) =>
      Object.entries(WEIGHTS)
        .filter(([id]) => CHECK_GROUP[id as CheckId] === group)
        .reduce((sum, [, weight]) => sum + weight, 0);
    expect(total('https')).toBe(30);
    expect(total('headers')).toBe(25);
    expect(total('page')).toBe(15);
    expect(total('dns-email')).toBe(25);
    expect(total('security-txt')).toBe(5);
    expect(Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('leave the shared and informational checks without a weight of their own', () => {
    for (const id of ['cert-expiry', 'tls-cipher', 'info-leak', 'coop', 'hsts-preload'] as const) {
      expect(WEIGHTS[id]).toBeUndefined();
    }
  });
});

describe('scoreOf', () => {
  it('is 100 when everything passes and 0 when everything fails', () => {
    expect(scoreOf(checks('pass'))).toBe(100);
    expect(scoreOf(checks('fail'))).toBe(0);
  });

  it('gives a warn half of its weight', () => {
    expect(scoreOf(checks('pass', { spf: 'warn' }))).toBe(97); // 6 / 2 = 3 points lost
    expect(scoreOf(checks('warn'))).toBe(50);
  });

  it('leaves info out instead of counting it', () => {
    expect(scoreOf(checks('pass', { dkim: 'info', caa: 'info' }))).toBe(100);
    expect(scoreOf(checks('fail', { spf: 'pass', dmarc: 'pass' }))).toBe(12); // 12 / 100
  });

  it('counts a shared weight once, by the worse status of the pair', () => {
    // cert-expiry fails: cert-valid's 8 points are lost, not 16.
    expect(scoreOf(checks('pass', { 'cert-expiry': 'fail' }))).toBe(92);
    expect(scoreOf(checks('pass', { 'tls-cipher': 'warn' }))).toBe(99); // 1.5 lost, rounded
    // An unknown half doesn't lower the known one.
    expect(scoreOf(checks('pass', { 'cert-expiry': 'info' }))).toBe(100);
    expect(scoreOf(checks('pass', { 'cert-valid': 'info', 'cert-expiry': 'fail' }))).toBe(92);
  });

  it('is 0 when nothing could be scored', () => {
    expect(scoreOf(checks('info'))).toBe(0);
  });
});

describe('gradeOf', () => {
  const clean = checks('pass');

  it('follows the thresholds', () => {
    const grade = (score: number) => gradeOf(score, checks('info'));
    expect([100, 96, 90, 89, 80, 79, 65, 64, 50, 49, 35, 34, 0].map(grade)).toEqual([
      'A+',
      'A',
      'A',
      'B',
      'B',
      'C',
      'C',
      'D',
      'D',
      'E',
      'E',
      'F',
      'F',
    ]);
  });

  it('gives A+ from 97 only with no warn or fail among the HTTPS and header checks', () => {
    expect(gradeOf(100, clean)).toBe('A+');
    expect(gradeOf(97, checks('pass', { 'info-leak': 'warn' }))).toBe('A');
    // A warning outside those groups doesn't stop it.
    expect(gradeOf(97, checks('pass', { spf: 'warn' }))).toBe('A+');
    expect(gradeOf(98, checks('pass', { 'tls-version': 'warn' }))).toBe('A');
  });

  it('caps the grade at D after a fail on the certificate, HTTPS or an http form', () => {
    for (const id of ['cert-valid', 'https-available', 'form-http'] as const) {
      expect(gradeOf(95, checks('pass', { [id]: 'fail' }))).toBe('D');
    }
    // A cap never raises a lower grade, and other fails don't cap.
    expect(gradeOf(40, checks('pass', { 'cert-valid': 'fail' }))).toBe('E');
    expect(gradeOf(95, checks('pass', { hsts: 'fail' }))).toBe('A');
  });

  it('is scored and graded together', () => {
    expect(gradeChecks(clean)).toEqual({ score: 100, grade: 'A+' });
    expect(gradeChecks(checks('fail')).grade).toBe('F');
  });
});
