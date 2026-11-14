import { describe, expect, it } from 'vitest';
import { slowStep, type SlowState } from './cloud-slow.js';

const now = new Date('2026-11-14T12:00:00.000Z');
const since = new Date('2026-11-14T11:00:00.000Z');
const idle: SlowState = { slowCount: 0, slowSince: null };

describe('slowStep', () => {
  it('counts slow checks in a row and starts the episode at the third', () => {
    const one = slowStep(idle, 1001, 1000, now);
    expect(one).toEqual({ slowCount: 1, slowSince: null, alert: null });
    const two = slowStep(one, 5000, 1000, now);
    expect(two).toEqual({ slowCount: 2, slowSince: null, alert: null });
    expect(slowStep(two, 2000, 1000, now)).toEqual({ slowCount: 0, slowSince: now, alert: 'slow' });
  });

  it('treats a response equal to the threshold as normal', () => {
    expect(slowStep({ slowCount: 2, slowSince: null }, 1000, 1000, now)).toEqual({
      slowCount: 0,
      slowSince: null,
      alert: null,
    });
  });

  it('resets the count on a normal check outside an episode', () => {
    expect(slowStep({ slowCount: 2, slowSince: null }, 200, 1000, now)).toEqual({
      slowCount: 0,
      slowSince: null,
      alert: null,
    });
  });

  it('ends the episode after three normal checks in a row', () => {
    const state: SlowState = { slowCount: 0, slowSince: since };
    const one = slowStep(state, 100, 1000, now);
    expect(one).toEqual({ slowCount: 1, slowSince: since, alert: null });
    const two = slowStep(one, 100, 1000, now);
    expect(two).toEqual({ slowCount: 2, slowSince: since, alert: null });
    expect(slowStep(two, 100, 1000, now)).toEqual({ slowCount: 0, slowSince: null, alert: 'fast' });
  });

  it('resets the count on a slow check inside an episode', () => {
    expect(slowStep({ slowCount: 2, slowSince: since }, 3000, 1000, now)).toEqual({
      slowCount: 0,
      slowSince: since,
      alert: null,
    });
  });

  it('keeps an idle monitor idle on normal checks', () => {
    expect(slowStep(idle, 100, 1000, now)).toEqual({ ...idle, alert: null });
  });
});
