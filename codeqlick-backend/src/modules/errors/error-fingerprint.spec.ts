import { describe, expect, it } from 'vitest';
import { errorFingerprint, normalizeMessage, topFrame } from './error-fingerprint.js';

describe('error fingerprints', () => {
  it('ignores ids, numbers and quoted values in the message', () => {
    expect(normalizeMessage('User 3f2a8c1e-1111-4222-8333-944445555666 not found')).toBe(
      'User <id> not found',
    );
    expect(normalizeMessage('Timeout after 5000 ms on "photos"')).toBe(
      'Timeout after <n> ms on <value>',
    );
  });

  it('takes the first frame of the app, without line numbers', () => {
    const stack = [
      'TypeError: x is undefined',
      '    at Array.map (<anonymous>)',
      '    at node:internal/process/task_queues:95:5',
      '    at render (/app/node_modules/react/index.js:10:2)',
      '    at SwipeService.deck (/app/dist/modules/swipe/swipe.service.js:120:17)',
    ].join('\n');
    // `Array.map (<anonymous>)` has no location, so it counts: its text is the frame.
    expect(topFrame(stack)).toBe('Array.map (<anonymous>)');
    expect(topFrame(stack.replace('    at Array.map (<anonymous>)\n', ''))).toBe(
      'SwipeService.deck (/app/dist/modules/swipe/swipe.service.js',
    );
  });

  it('groups the same error across ids and line numbers, but not across sources', () => {
    const a = errorFingerprint('API', 'Booking 12 failed', 'Error\n    at f (/app/a.js:1:2)');
    const b = errorFingerprint('API', 'Booking 99 failed', 'Error\n    at f (/app/a.js:7:9)');
    const c = errorFingerprint(
      'WEB_SERVER',
      'Booking 99 failed',
      'Error\n    at f (/app/a.js:7:9)',
    );
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
