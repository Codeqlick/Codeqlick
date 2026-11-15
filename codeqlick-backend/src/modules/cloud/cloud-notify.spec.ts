import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  auditDroppedEvent,
  auditDroppedPayload,
  channelUrlProblem,
  formLines,
  monitorEvent,
  monitorPayload,
  monitorSummary,
  payload,
  signature,
  summary,
  testEvent,
  testFormEvent,
  urlHint,
  wants,
  wantsForm,
  type FormEvent,
  type NotifyEvent,
} from './cloud-notify.js';

const failed: NotifyEvent = {
  event: 'build.failed',
  project: { slug: 'web', name: 'Web' },
  build: {
    number: 12,
    target: 'production',
    branch: 'main',
    commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    commitMessage: 'Fix <header> & footer\n\nLonger body',
    author: 'ana',
    pullRequest: null,
    status: 'FAILED',
    error: 'The build exited with code 1',
    keptAsPreview: false,
    durationMs: 42_000,
    url: 'https://cloud.codeqlick.com/en/console/team/web/builds/12',
  },
  deployment: null,
  sentAt: '2026-11-13T12:00:00.000Z',
};
const published: NotifyEvent = {
  ...failed,
  event: 'build.succeeded',
  build: { ...failed.build, status: 'SUCCEEDED', error: null },
  deployment: { url: 'https://web.codeqlick.app' },
};

describe('Cloud build notifications', () => {
  it('accepts only the right service over https on a public address', () => {
    expect(channelUrlProblem('SLACK', 'https://hooks.slack.com/services/T0/B0/x')).toBeNull();
    expect(channelUrlProblem('SLACK', 'https://example.com/services/x')).toMatch(/Slack/);
    expect(channelUrlProblem('DISCORD', 'https://discord.com/api/webhooks/1/abc')).toBeNull();
    expect(channelUrlProblem('DISCORD', 'https://discord.com/channels/1')).toMatch(/Discord/);
    expect(channelUrlProblem('WEBHOOK', 'https://hooks.example.com/cloud')).toBeNull();
    expect(channelUrlProblem('WEBHOOK', 'http://hooks.example.com/cloud')).toMatch(/https/);
    expect(channelUrlProblem('WEBHOOK', 'https://127.0.0.1/x')).toMatch(/Private/);
    expect(channelUrlProblem('WEBHOOK', 'https://10.0.0.5/x')).toMatch(/Private/);
    expect(channelUrlProblem('WEBHOOK', 'https://example.com:8443/x')).toMatch(/port/);
    expect(channelUrlProblem('WEBHOOK', 'https://user:pw@example.com/x')).toMatch(/credentials/);
    expect(channelUrlProblem('WEBHOOK', 'not a url')).toMatch(/valid/);
  });

  it('shows only the host and the last 4 characters of a URL', () => {
    expect(urlHint('https://hooks.slack.com/services/T0/B0/secretXYZ9')).toBe(
      'hooks.slack.com/…XYZ9',
    );
  });

  it('tells each channel only what it asked for', () => {
    const channel = { enabled: true, buildFailed: true, buildSucceeded: false, previews: false };
    expect(wants(channel, 'build.failed', 'production')).toBe(true);
    expect(wants(channel, 'build.succeeded', 'production')).toBe(false);
    expect(wants(channel, 'build.failed', 'preview')).toBe(false);
    expect(wants({ ...channel, previews: true }, 'build.failed', 'preview')).toBe(true);
    expect(wants({ ...channel, enabled: false }, 'build.failed', 'production')).toBe(false);
    expect(wants(channel, 'test', 'production')).toBe(true);
  });

  it('summarises a build in both languages', () => {
    expect(summary(failed, 'en')).toBe(
      'Web · build #12 of main (a1b2c3d Fix <header> & footer) failed: The build exited with code 1',
    );
    expect(summary(failed, 'es')).toContain('la compilación #12 de main');
    expect(summary(published, 'en')).toBe(
      'Web · main (a1b2c3d Fix <header> & footer) published at https://web.codeqlick.app',
    );
    const preview = { ...published, build: { ...published.build, target: 'preview' as const } };
    expect(summary(preview, 'es')).toContain('vista previa');
  });

  it('says a production build kept as a preview is not published (production locked)', () => {
    const kept: NotifyEvent = {
      ...published,
      build: { ...published.build, keptAsPreview: true },
      deployment: { url: 'https://web--a1b2c3d4.codeqlick.app' },
    };
    expect(summary(kept, 'en')).toBe(
      'Web · preview of main (a1b2c3d Fix <header> & footer) ready at https://web--a1b2c3d4.codeqlick.app (production is locked after a rollback)',
    );
    expect(summary(kept, 'es')).toBe(
      'Web · vista previa de main (a1b2c3d Fix <header> & footer) lista en https://web--a1b2c3d4.codeqlick.app (producción bloqueada tras volver atrás)',
    );
    expect(summary(kept, 'en')).not.toContain('published');
    // The webhook gets the flag with the rest of the event.
    expect(JSON.parse(payload('WEBHOOK', kept, 'en'))).toMatchObject({
      build: { target: 'production', keptAsPreview: true },
    });
  });

  it('escapes Slack markup and links the build', () => {
    const body = JSON.parse(payload('SLACK', failed, 'en')) as { text: string };
    expect(body.text).toContain('Fix &lt;header&gt; &amp; footer');
    expect(body.text).toContain(`<${failed.build.url}|Build #12>`);
  });

  it('never lets Discord ping anyone from a commit message', () => {
    const body = JSON.parse(payload('DISCORD', published, 'en')) as {
      allowed_mentions: { parse: string[] };
      embeds: Array<{ url: string; color: number; description: string }>;
    };
    expect(body.allowed_mentions.parse).toEqual([]);
    expect(body.embeds[0]!.url).toBe(failed.build.url);
    expect(body.embeds[0]!.description).toContain('https://web.codeqlick.app');
  });

  it('posts the whole event to a webhook and signs it', () => {
    const body = payload('WEBHOOK', failed, 'en');
    expect(JSON.parse(body)).toEqual(failed);
    expect(signature('cqn_secret', body)).toBe(
      `sha256=${createHmac('sha256', 'cqn_secret').update(body).digest('hex')}`,
    );
  });

  it('builds a sample event for tests', () => {
    const event = testEvent({ slug: 'web', name: 'Web' }, 'https://cloud/x');
    expect(event.event).toBe('test');
    expect(summary(event, 'es')).toBe('Web · mensaje de prueba de Codeqlick Cloud');
  });

  // Form submissions (decision 63).
  const submitted: FormEvent = {
    event: 'form.submitted',
    project: { slug: 'web', name: 'Web & Co' },
    form: { id: 'f1', name: 'Contact' },
    submission: {
      id: 's1',
      fields: [
        ['name <b>', 'Eve & <!channel> <@123> [click](https://evil.example)'],
        ['message', `${'x'.repeat(320)}\n# end`],
        ...Array.from({ length: 10 }, (_, i): [string, string] => [`f${i}`, `v${i}`]),
      ],
      email: 'eve@example.com',
      page: 'https://web.codeqlick.app/contact',
      createdAt: '2026-11-14T12:00:00.000Z',
      url: 'https://cloud.codeqlick.com/en/console/team/web?tab=forms&form=f1',
    },
    sentAt: '2026-11-14T12:00:01.000Z',
  };

  it('tells only Slack, Discord and webhook channels that follow the form', () => {
    const channel = { enabled: true, kind: 'WEBHOOK' as const, formSubmitted: true, formIds: [] };
    expect(wantsForm(channel, 'f1')).toBe(true);
    expect(wantsForm({ ...channel, formIds: ['f1'] }, 'f1')).toBe(true);
    expect(wantsForm({ ...channel, formIds: ['f2'] }, 'f1')).toBe(false);
    expect(wantsForm({ ...channel, formSubmitted: false }, 'f1')).toBe(false);
    expect(wantsForm({ ...channel, enabled: false }, 'f1')).toBe(false);
    expect(wantsForm({ ...channel, kind: 'EMAIL' }, 'f1')).toBe(false);
  });

  it('shows 10 fields at most, in order, on one line each and cut to 300 characters', () => {
    const lines = formLines(submitted.submission.fields, 'en', (text) => text);
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe('name <b>: Eve & <!channel> <@123> [click](https://evil.example)');
    expect(lines[1]).toBe(`message: ${'x'.repeat(299)}…`);
    expect(lines[9]).toBe('f7: v7');
    expect(lines[10]).toBe('+2 more fields');
    expect(formLines(submitted.submission.fields.slice(0, 11), 'es', (t) => t)[10]).toBe(
      '+1 campo más',
    );
    expect(formLines([['a', 'b']], 'en', (t) => t)).toEqual(['a: b']);
  });

  it("escapes visitors' words for Slack and links the submissions", () => {
    const body = JSON.parse(payload('SLACK', submitted, 'en')) as {
      text: string;
      unfurl_links: boolean;
    };
    expect(body.text.split('\n')[0]).toBe('📨 *Web &amp; Co* · new submission to *Contact*');
    expect(body.text).toContain('name &lt;b&gt;: Eve &amp; &lt;!channel&gt; &lt;@123&gt;');
    expect(body.text).not.toContain('<!channel>');
    expect(body.text).toContain('+2 more fields');
    expect(body.text).toContain(`<${submitted.submission.url}|See the submissions>`);
    expect(body.unfurl_links).toBe(false);
  });

  it('never lets Discord ping anyone or make links from a submission', () => {
    const body = JSON.parse(payload('DISCORD', submitted, 'es')) as {
      allowed_mentions: { parse: string[] };
      embeds: Array<{ title: string; url: string; description: string }>;
    };
    expect(body.allowed_mentions.parse).toEqual([]);
    const embed = body.embeds[0]!;
    expect(embed.title).toBe('📨 Web & Co · nuevo envío en Contact');
    expect(embed.url).toBe(submitted.submission.url);
    expect(embed.description).toContain(
      'name \\<b\\>: Eve & \\<!channel\\> \\<\\@123\\> \\[click\\]\\(https\\://evil.example\\)',
    );
    expect(embed.description).toContain('+2 campos más');
    expect(embed.description.endsWith(`[Ver los envíos](${submitted.submission.url})`)).toBe(true);
  });

  it('keeps a Discord description within its length, by whole lines', () => {
    const heavy: FormEvent = {
      ...submitted,
      submission: {
        ...submitted.submission,
        fields: Array.from({ length: 10 }, (_, i): [string, string] => [
          `field_${i}`,
          `${'*_<>[]()'.repeat(35)}😀😀😀`,
        ]),
      },
    };
    const body = JSON.parse(payload('DISCORD', heavy, 'en')) as {
      embeds: Array<{ title: string; description: string }>;
    };
    const { description } = body.embeds[0]!;
    expect(description.length).toBeLessThanOrEqual(4096);
    const unpaired = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(unpaired.test(description)).toBe(false);
    expect(description).toMatch(/\n\+\d+ more fields\n\[See the submissions\]/);
    const shown = description.split('\n').filter((l) => l.startsWith('field\\_')).length;
    expect(shown).toBeGreaterThan(0);
    expect(description).toContain(`+${10 - shown} more fields`);
    const long = { ...heavy, form: { ...heavy.form, name: '😀'.repeat(300) } };
    const title = (JSON.parse(payload('DISCORD', long, 'en')) as typeof body).embeds[0]!.title;
    expect(Array.from(title)).toHaveLength(256);
    expect(unpaired.test(title)).toBe(false);
  });

  it('posts the whole submission to a webhook', () => {
    expect(JSON.parse(payload('WEBHOOK', submitted, 'en'))).toEqual(submitted);
  });

  it('builds a sample submission for tests', () => {
    const event = testFormEvent({ slug: 'web', name: 'Web' }, 'https://cloud/x', 'es');
    expect(event).toMatchObject({ event: 'test', form: { name: 'Contacto' } });
    const body = JSON.parse(payload('SLACK', event, 'es')) as { text: string };
    expect(body.text).toContain('🔔 *Web* · prueba: nuevo envío en *Contacto*');
    expect(body.text).toContain('email: ada@example.com');
  });

  describe('monitor alerts', () => {
    const project = { slug: 'web', name: 'Web' };
    const api = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'API <prod>',
      kind: 'HTTP' as const,
      url: 'https://api.example.com/health',
    };
    const consoleUrl = `https://cloud.codeqlick.com/en/console/team/monitors/${api.id}`;
    const now = new Date('2026-11-14T12:00:00.000Z');
    const down = monitorEvent({
      kind: 'down',
      project,
      monitor: api,
      error: 'Timeout after 15 s @everyone',
      minutes: 3,
      certExpires: new Date('2026-12-02T10:00:00.000Z'),
      consoleUrl,
      now,
    });
    const up = monitorEvent({
      kind: 'up',
      project,
      monitor: api,
      error: null,
      minutes: 12,
      consoleUrl,
      now,
    });
    const cert = monitorEvent({
      kind: 'cert',
      project,
      monitor: api,
      error: null,
      certExpires: new Date('2026-12-02T10:00:00.000Z'),
      consoleUrl,
      now,
    });

    const slow = monitorEvent({
      kind: 'slow',
      project,
      monitor: api,
      error: null,
      responseMs: 2400,
      slowMs: 1000,
      consoleUrl,
      now,
    });
    const fast = monitorEvent({
      kind: 'fast',
      project,
      monitor: api,
      error: null,
      minutes: 25,
      responseMs: 300,
      slowMs: 1000,
      consoleUrl,
      now,
    });

    it('gives each field only where it belongs', () => {
      expect(down).toEqual({
        event: 'monitor.down',
        project,
        monitor: api,
        error: 'Timeout after 15 s @everyone',
        downMinutes: null,
        certExpiresAt: null,
        responseMs: null,
        slowMs: null,
        slowMinutes: null,
        consoleUrl,
        sentAt: now.toISOString(),
      });
      expect(up).toMatchObject({ event: 'monitor.up', downMinutes: 12, certExpiresAt: null });
      expect(cert).toMatchObject({
        event: 'monitor.cert',
        error: null,
        downMinutes: null,
        certExpiresAt: '2026-12-02T10:00:00.000Z',
      });
      expect(slow).toMatchObject({
        event: 'monitor.slow',
        error: null,
        downMinutes: null,
        certExpiresAt: null,
        responseMs: 2400,
        slowMs: 1000,
        slowMinutes: null,
      });
      expect(fast).toMatchObject({
        event: 'monitor.fast',
        responseMs: 300,
        slowMs: 1000,
        slowMinutes: 25,
        downMinutes: null,
      });
      const beat = monitorEvent({
        kind: 'down',
        project,
        monitor: { ...api, kind: 'HEARTBEAT', url: null },
        error: 'No call yet',
        consoleUrl,
        now,
      });
      expect(beat.monitor.url).toBeNull();
    });

    it('summarises an alert in both languages', () => {
      expect(monitorSummary(down, 'en')).toBe(
        'Web · API <prod> is down: Timeout after 15 s @everyone',
      );
      expect(monitorSummary(down, 'es')).toContain('API <prod> está caído');
      expect(monitorSummary(up, 'en')).toBe('Web · API <prod> is back up after 12 min');
      expect(monitorSummary(up, 'es')).toBe('Web · API <prod> vuelve a funcionar tras 12 min');
      expect(monitorSummary(cert, 'en')).toBe(
        'Web · the certificate of API <prod> expires on 2 Dec 2026',
      );
      expect(monitorSummary(cert, 'es')).toContain('el certificado de API <prod> caduca el 2');
      expect(monitorSummary(slow, 'en')).toBe(
        'Web · API <prod> is slow: 2,400 ms (limit 1,000 ms)',
      );
      expect(monitorSummary(slow, 'es')).toContain('API <prod> responde despacio: 2400 ms');
      expect(monitorSummary(fast, 'en')).toBe('Web · API <prod> is back to normal after 25 min');
      expect(monitorSummary(fast, 'es')).toBe(
        'Web · API <prod> vuelve a la normalidad tras 25 min',
      );
    });

    it('escapes Slack markup and links the monitor', () => {
      const body = JSON.parse(monitorPayload('SLACK', down, 'en')) as { text: string };
      expect(body.text).toContain('🔴 *Web* · *API &lt;prod&gt;* is down');
      expect(body.text).toContain(`<${consoleUrl}|Open the monitor>`);
      const es = JSON.parse(monitorPayload('SLACK', up, 'es')) as { text: string };
      expect(es.text).toContain('🟢');
      expect(es.text).toContain('|Ver el monitor>');
      const slowText = JSON.parse(monitorPayload('SLACK', slow, 'en')) as { text: string };
      expect(slowText.text).toContain('🐢 *Web* · *API &lt;prod&gt;* is slow: 2,400 ms');
      const fastText = JSON.parse(monitorPayload('SLACK', fast, 'en')) as { text: string };
      expect(fastText.text).toContain(
        '⚡ *Web* · *API &lt;prod&gt;* is back to normal after 25 min',
      );
    });

    it('colours Discord embeds and never pings anyone', () => {
      const colour = (e: typeof down) =>
        (
          JSON.parse(monitorPayload('DISCORD', e, 'en')) as {
            allowed_mentions: { parse: string[] };
            embeds: Array<{ url: string; color: number; title: string }>;
          }
        ).embeds[0]!;
      const body = JSON.parse(monitorPayload('DISCORD', down, 'en')) as {
        allowed_mentions: { parse: string[] };
      };
      expect(body.allowed_mentions.parse).toEqual([]);
      expect(colour(down)).toMatchObject({ url: consoleUrl, color: 0xd92d20 });
      expect(colour(up).color).toBe(0x12b76a);
      expect(colour(slow)).toMatchObject({ color: 0xfb6514, title: '🐢 Web · API <prod>' });
      expect(colour(fast).color).toBe(0x12b76a);
      expect(colour(cert)).toMatchObject({ color: 0xf79009, title: '⚠️ Web · API <prod>' });
    });

    it('posts the whole alert to a webhook', () => {
      expect(JSON.parse(monitorPayload('WEBHOOK', up, 'en'))).toEqual(up);
      expect(JSON.parse(monitorPayload('WEBHOOK', slow, 'en'))).toEqual(slow);
    });
  });
});

describe('website-check drops (decision 81)', () => {
  const consoleUrl = 'https://cloud.test/en/console/acme/audits/a2';
  const categories = { speed: 90, mobile: 90, seo: 95, security: 90 };
  const dropped = auditDroppedEvent({
    project: { slug: 'web', name: 'Web <1> & co' },
    audit: {
      id: 'a2',
      url: 'https://web.cloud.test/',
      score: 78,
      categories: { ...categories, seo: 70 },
      createdAt: '2026-11-16T02:00:00.000Z',
    },
    previous: { id: 'a1', score: 92, categories, createdAt: '2026-11-09T02:00:00.000Z' },
    drop: {
      score: { from: 92, to: 78 },
      categories: [{ key: 'seo', from: 95, to: 70 }],
      checks: [
        { id: 'hsts', category: 'security' },
        { id: 'h1', category: 'seo' },
      ],
    },
    consoleUrl,
    now: new Date('2026-11-16T02:01:00Z'),
  });

  it('gives the webhook exactly the documented body, the checks titled in English', () => {
    expect(JSON.parse(auditDroppedPayload('WEBHOOK', dropped, 'es'))).toEqual({
      event: 'audit.dropped',
      project: { slug: 'web', name: 'Web <1> & co' },
      audit: {
        id: 'a2',
        url: 'https://web.cloud.test/',
        score: 78,
        categories: { ...categories, seo: 70 },
        createdAt: '2026-11-16T02:00:00.000Z',
      },
      previous: { id: 'a1', score: 92, categories, createdAt: '2026-11-09T02:00:00.000Z' },
      dropped: {
        score: { from: 92, to: 78 },
        categories: [{ key: 'seo', from: 95, to: 70 }],
        checks: [
          { id: 'hsts', category: 'security', title: expect.any(String) },
          { id: 'h1', category: 'seo', title: expect.any(String) },
        ],
      },
      consoleUrl,
      sentAt: '2026-11-16T02:01:00.000Z',
    });
  });

  it('writes the Slack line in the channel’s language, escaping the names', () => {
    const en = JSON.parse(auditDroppedPayload('SLACK', dropped, 'en')) as { text: string };
    expect(en.text).toContain(
      '📉 *Web &lt;1&gt; &amp; co* · website score dropped from 92 to 78 (Google 95 → 70, 2 checks failed)',
    );
    expect(en.text).toContain(`<${consoleUrl}|See the report>`);
    const es = JSON.parse(auditDroppedPayload('SLACK', dropped, 'es')) as { text: string };
    expect(es.text).toContain('la nota de la web ha bajado de 92 a 78');
    expect(es.text).toContain('2 comprobaciones fallan');
  });

  it('sends Discord an orange embed that pings no one', () => {
    const body = JSON.parse(auditDroppedPayload('DISCORD', dropped, 'en')) as {
      allowed_mentions: { parse: string[] };
      embeds: Array<{ url: string; color: number; title: string }>;
    };
    expect(body.allowed_mentions.parse).toEqual([]);
    expect(body.embeds[0]).toMatchObject({
      url: consoleUrl,
      color: 0xf79009,
      title: '📉 Web <1> & co · Website check',
    });
  });
});
