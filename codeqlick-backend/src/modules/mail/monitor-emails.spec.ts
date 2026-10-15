import { describe, expect, it } from 'vitest';
import { monitorEmail } from './monitor-emails.js';

describe('monitorEmail', () => {
  it('lists the problems in the alert, with the first one in the subject', () => {
    const email = monitorEmail(
      'alert',
      ['service api is unhealthy', 'disk / is 93% full'],
      'vps-1',
      'https://codeqlick.com',
    );
    expect(email.subject).toBe('[codeqlick] ALERT: service api is unhealthy');
    expect(email.text).toContain('• service api is unhealthy\n• disk / is 93% full');
    expect(email.html).toContain('>Something is wrong on the server</h1>');
    expect(email.html).toContain('src="https://codeqlick.com/email/logo.png"');
  });

  it('says what was fixed when everything is back, and escapes what it shows', () => {
    const email = monitorEmail('resolved', ['<b>odd</b>'], 'vps-1', 'https://codeqlick.com');
    expect(email.subject).toBe('[codeqlick] Resolved');
    expect(email.html).toContain('&lt;b&gt;odd&lt;/b&gt;');
    expect(monitorEmail('test', [], 'vps-1', 'https://codeqlick.com').subject).toBe(
      '[codeqlick] Monitor test',
    );
  });
});
