import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  channelUrlProblem,
  payload,
  signature,
  summary,
  testEvent,
  urlHint,
  wants,
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
});
