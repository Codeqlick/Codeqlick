import { createHmac } from 'node:crypto';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { CloudNotifyKind } from '../../generated/prisma/client.js';
import { assertCheckableUrl } from '../site-audits/safe-fetch.js';

/**
 * Build notifications' messages (architecture 4.13 "Build notifications", decision 43): the
 * event every channel is told about and how Slack, Discord and a team's webhook receive it.
 */

export type NotifyEventName = 'build.failed' | 'build.succeeded' | 'test';

export interface NotifyEvent {
  event: NotifyEventName;
  project: { slug: string; name: string };
  build: {
    number: number;
    target: 'production' | 'preview';
    branch: string;
    commit: string;
    commitMessage: string | null;
    author: string | null;
    pullRequest: number | null;
    status: 'SUCCEEDED' | 'FAILED';
    error: string | null;
    /** A production build deployed as a preview: production is locked after a rollback. */
    keptAsPreview: boolean;
    durationMs: number | null;
    url: string;
  };
  deployment: { url: string } | null;
  sentAt: string;
}

/** A URL a channel of `kind` may post to, or the reason it may not. */
export function channelUrlProblem(kind: CloudNotifyKind, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Not a valid address';
  }
  if (url.protocol !== 'https:') return 'Only https addresses';
  try {
    assertCheckableUrl(url);
  } catch (error) {
    return error instanceof Error ? error.message : 'Unsafe address';
  }
  if (
    kind === 'SLACK' &&
    !(url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/'))
  ) {
    return 'A Slack incoming webhook starts with https://hooks.slack.com/';
  }
  if (
    kind === 'DISCORD' &&
    !(
      ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(
        url.hostname,
      ) && url.pathname.startsWith('/api/webhooks/')
    )
  ) {
    return 'A Discord webhook starts with https://discord.com/api/webhooks/';
  }
  return null;
}

/** What the console shows of a sealed URL: its host and its last 4 characters. */
export function urlHint(raw: string): string {
  const url = new URL(raw);
  return `${url.host}/…${raw.slice(-4)}`;
}

/** `X-Codeqlick-Signature` of a webhook delivery. */
export function signature(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Whether a channel wants to hear about a build that ended as `event`. */
export function wants(
  channel: { enabled: boolean; buildFailed: boolean; buildSucceeded: boolean; previews: boolean },
  event: NotifyEventName,
  target: 'production' | 'preview',
): boolean {
  if (!channel.enabled) return false;
  if (event === 'test') return true;
  if (target === 'preview' && !channel.previews) return false;
  return event === 'build.failed' ? channel.buildFailed : channel.buildSucceeded;
}

const firstLine = (text: string | null) => (text ?? '').split('\n')[0]!.trim().slice(0, 100);

/** The one-line summary, as plain text, in `locale`. */
export function summary(e: NotifyEvent, locale: ApiLocale): string {
  const es = locale === 'es';
  const sha = e.build.commit.slice(0, 7);
  const subject = firstLine(e.build.commitMessage);
  const where = `${e.build.branch} (${sha}${subject ? ` ${subject}` : ''})`;
  if (e.event === 'test') {
    return es
      ? `${e.project.name} · mensaje de prueba de Codeqlick Cloud`
      : `${e.project.name} · test message from Codeqlick Cloud`;
  }
  if (e.event === 'build.failed') {
    const reason = e.build.error ? `: ${e.build.error}` : '';
    return es
      ? `${e.project.name} · la compilación #${e.build.number} de ${where} ha fallado${reason}`
      : `${e.project.name} · build #${e.build.number} of ${where} failed${reason}`;
  }
  if (e.build.keptAsPreview) {
    return es
      ? `${e.project.name} · vista previa de ${where} lista en ${e.deployment?.url ?? ''} (producción bloqueada tras volver atrás)`
      : `${e.project.name} · preview of ${where} ready at ${e.deployment?.url ?? ''} (production is locked after a rollback)`;
  }
  if (e.build.target === 'production') {
    return es
      ? `${e.project.name} · ${where} publicado en ${e.deployment?.url ?? ''}`
      : `${e.project.name} · ${where} published at ${e.deployment?.url ?? ''}`;
  }
  return es
    ? `${e.project.name} · vista previa de ${where} lista en ${e.deployment?.url ?? ''}`
    : `${e.project.name} · preview of ${where} ready at ${e.deployment?.url ?? ''}`;
}

const icon = (e: NotifyEvent) =>
  e.event === 'build.failed' ? '❌' : e.event === 'test' ? '🔔' : '✅';

/** Slack's mrkdwn treats &, < and > as markup. */
const slackEscape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The body posted to a channel of `kind` (JSON). */
export function payload(
  kind: Exclude<CloudNotifyKind, 'EMAIL'>,
  e: NotifyEvent,
  locale: ApiLocale,
): string {
  const es = locale === 'es';
  const text = `${icon(e)} ${summary(e, locale)}`;
  const buildLabel = es ? `Compilación #${e.build.number}` : `Build #${e.build.number}`;
  if (kind === 'SLACK') {
    const links = [
      ...(e.deployment ? [`<${e.deployment.url}|${es ? 'Abrir la web' : 'Open the site'}>`] : []),
      `<${e.build.url}|${buildLabel}>`,
    ].join(' · ');
    return JSON.stringify({ text: `${slackEscape(text)}\n${links}`, unfurl_links: false });
  }
  if (kind === 'DISCORD') {
    return JSON.stringify({
      username: 'Codeqlick Cloud',
      // Commit messages are other people's words: never let them ping anyone.
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `${icon(e)} ${e.project.name} · ${buildLabel}`.slice(0, 256),
          url: e.build.url,
          description: [summary(e, locale), ...(e.deployment ? [e.deployment.url] : [])]
            .join('\n')
            .slice(0, 4000),
          color: e.event === 'build.failed' ? 0xd92d20 : e.event === 'test' ? 0xd9177e : 0x12b76a,
          timestamp: e.sentAt,
        },
      ],
    });
  }
  return JSON.stringify(e);
}

/** A sample event for "Send a test". */
export function testEvent(
  project: { slug: string; name: string },
  consoleUrl: string,
  now = new Date(),
): NotifyEvent {
  return {
    event: 'test',
    project,
    build: {
      number: 0,
      target: 'production',
      branch: 'main',
      commit: '0000000000000000000000000000000000000000',
      commitMessage: null,
      author: null,
      pullRequest: null,
      status: 'SUCCEEDED',
      error: null,
      keptAsPreview: false,
      durationMs: null,
      url: consoleUrl,
    },
    deployment: null,
    sentAt: now.toISOString(),
  };
}
