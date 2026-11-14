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

// ── Monitor alerts (decision 64) ─────────────────────────────────────────────────────────────

export type MonitorEventName =
  | 'monitor.down'
  | 'monitor.up'
  | 'monitor.cert'
  | 'monitor.slow'
  | 'monitor.fast';

/** What a Slack, Discord or webhook channel is told when a monitor of its project alerts. */
export interface MonitorNotifyEvent {
  event: MonitorEventName;
  project: { slug: string; name: string };
  monitor: { id: string; name: string; kind: 'HTTP' | 'HEARTBEAT'; url: string | null };
  error: string | null;
  downMinutes: number | null;
  certExpiresAt: string | null;
  responseMs: number | null;
  slowMs: number | null;
  slowMinutes: number | null;
  consoleUrl: string;
  sentAt: string;
}

/** A monitor alert as channels receive it: each field only where the spec gives it. */
export function monitorEvent(input: {
  kind: 'down' | 'up' | 'cert' | 'slow' | 'fast';
  project: { slug: string; name: string };
  monitor: { id: string; name: string; kind: 'HTTP' | 'HEARTBEAT'; url: string | null };
  error: string | null;
  minutes?: number;
  certExpires?: Date;
  responseMs?: number;
  slowMs?: number;
  consoleUrl: string;
  now?: Date;
}): MonitorNotifyEvent {
  const slowKind = input.kind === 'slow' || input.kind === 'fast';
  return {
    event: `monitor.${input.kind}`,
    project: { slug: input.project.slug, name: input.project.name },
    monitor: {
      id: input.monitor.id,
      name: input.monitor.name,
      kind: input.monitor.kind,
      url: input.monitor.kind === 'HTTP' ? input.monitor.url : null,
    },
    error: input.kind === 'down' || input.kind === 'up' ? input.error : null,
    downMinutes: input.kind === 'up' ? (input.minutes ?? null) : null,
    certExpiresAt: input.kind === 'cert' ? (input.certExpires?.toISOString() ?? null) : null,
    responseMs: slowKind ? (input.responseMs ?? null) : null,
    slowMs: slowKind ? (input.slowMs ?? null) : null,
    slowMinutes: input.kind === 'fast' ? (input.minutes ?? null) : null,
    consoleUrl: input.consoleUrl,
    sentAt: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * A monitor alert's one line in `locale`; `strong` marks the project's and monitor's names and
 * `plain` everything else (Slack escapes both).
 */
export function monitorSummary(
  e: MonitorNotifyEvent,
  locale: ApiLocale,
  strong: (text: string) => string = (text) => text,
  plain: (text: string) => string = (text) => text,
): string {
  const es = locale === 'es';
  const project = strong(e.project.name);
  const monitor = strong(e.monitor.name);
  const ms = (value: number | null) =>
    `${new Intl.NumberFormat(es ? 'es-ES' : 'en-US').format(value ?? 0)} ms`;
  if (e.event === 'monitor.down') {
    const reason = e.error ? `: ${plain(e.error)}` : '';
    return es
      ? `${project} · ${monitor} está caído${reason}`
      : `${project} · ${monitor} is down${reason}`;
  }
  if (e.event === 'monitor.up') {
    if (!e.downMinutes) {
      return es
        ? `${project} · ${monitor} vuelve a funcionar`
        : `${project} · ${monitor} is back up`;
    }
    return es
      ? `${project} · ${monitor} vuelve a funcionar tras ${e.downMinutes} min`
      : `${project} · ${monitor} is back up after ${e.downMinutes} min`;
  }
  if (e.event === 'monitor.slow') {
    return es
      ? `${project} · ${monitor} responde despacio: ${ms(e.responseMs)} (límite ${ms(e.slowMs)})`
      : `${project} · ${monitor} is slow: ${ms(e.responseMs)} (limit ${ms(e.slowMs)})`;
  }
  if (e.event === 'monitor.fast') {
    const after = e.slowMinutes
      ? es
        ? ` tras ${e.slowMinutes} min`
        : ` after ${e.slowMinutes} min`
      : '';
    return es
      ? `${project} · ${monitor} vuelve a la normalidad${after}`
      : `${project} · ${monitor} is back to normal${after}`;
  }
  const date = e.certExpiresAt
    ? new Intl.DateTimeFormat(es ? 'es-ES' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/Madrid',
      }).format(new Date(e.certExpiresAt))
    : '';
  return es
    ? `${project} · el certificado de ${monitor} caduca el ${date}`
    : `${project} · the certificate of ${monitor} expires on ${date}`;
}

const MONITOR_ICONS: Record<MonitorEventName, string> = {
  'monitor.down': '🔴',
  'monitor.up': '🟢',
  'monitor.cert': '⚠️',
  'monitor.slow': '🐢',
  'monitor.fast': '⚡',
};
const MONITOR_COLORS: Record<MonitorEventName, number> = {
  'monitor.down': 0xd92d20,
  'monitor.up': 0x12b76a,
  'monitor.cert': 0xf79009,
  'monitor.slow': 0xfb6514,
  'monitor.fast': 0x12b76a,
};
const monitorIcon = (e: MonitorNotifyEvent) => MONITOR_ICONS[e.event];

/** The body of a monitor alert posted to a channel of `kind` (JSON). */
export function monitorPayload(
  kind: Exclude<CloudNotifyKind, 'EMAIL'>,
  e: MonitorNotifyEvent,
  locale: ApiLocale,
): string {
  const es = locale === 'es';
  const label = es ? 'Ver el monitor' : 'Open the monitor';
  if (kind === 'SLACK') {
    const text = `${monitorIcon(e)} ${monitorSummary(e, locale, (t) => `*${slackEscape(t)}*`, slackEscape)}`;
    return JSON.stringify({ text: `${text}\n<${e.consoleUrl}|${label}>`, unfurl_links: false });
  }
  if (kind === 'DISCORD') {
    return JSON.stringify({
      username: 'Codeqlick Cloud',
      // Names and errors (a remote server's words) must never ping anyone.
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `${monitorIcon(e)} ${e.project.name} · ${e.monitor.name}`.slice(0, 256),
          url: e.consoleUrl,
          description: monitorSummary(e, locale).slice(0, 4000),
          color: MONITOR_COLORS[e.event],
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
      durationMs: null,
      url: consoleUrl,
    },
    deployment: null,
    sentAt: now.toISOString(),
  };
}
