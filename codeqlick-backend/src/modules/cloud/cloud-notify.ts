import { createHmac } from 'node:crypto';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { CloudNotifyKind } from '../../generated/prisma/client.js';
import { assertCheckableUrl } from '../site-audits/safe-fetch.js';

/**
 * Build notifications' messages (architecture 4.13 "Build notifications", decisions 43 and 63):
 * the events channels are told about (builds and form submissions) and how Slack, Discord and a
 * team's webhook receive them.
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

/** A stored form submission, for Slack, Discord and webhook channels (decision 63). */
export interface FormEvent {
  /** `test` for "Send a test" with a sample submission. */
  event: 'form.submitted' | 'test';
  project: { slug: string; name: string };
  form: { id: string; name: string };
  submission: {
    id: string;
    /** As stored: `[name, value]` pairs in the order they came. */
    fields: Array<[string, string]>;
    email: string | null;
    page: string | null;
    createdAt: string;
    /** The form's submissions in the console. */
    url: string;
  };
  sentAt: string;
}

export type AnyNotifyEvent = NotifyEvent | FormEvent;

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

/** Whether a channel wants to hear about a submission to the form `formId`. */
export function wantsForm(
  channel: { enabled: boolean; kind: CloudNotifyKind; formSubmitted: boolean; formIds: string[] },
  formId: string,
): boolean {
  if (!channel.enabled || channel.kind === 'EMAIL' || !channel.formSubmitted) return false;
  return channel.formIds.length === 0 || channel.formIds.includes(formId);
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

/**
 * Discord's markdown: a backslash before punctuation shows it as it is, so a visitor's words
 * can't make masked links, headings, quotes, code blocks or mentions.
 */
const discordEscape = (text: string) => text.replace(/[\\*_~`|<>[\]()#@:-]/g, '\\$&');

/** Fields in a chat message, characters of a field's name and of its value. */
export const FORM_FIELDS_SHOWN = 10;
const FORM_NAME_CHARS = 60;
const FORM_VALUE_CHARS = 300;

/** Text on one line, cut to `max` characters (the last one an ellipsis when it was longer). */
function oneLine(text: string, max: number): string {
  // By code points, so an emoji is never cut in half.
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

/** Room for the field lines in a Discord embed's description (4,096 at most in all). */
export const DISCORD_LINES_BUDGET = 3800;

/** Cut to `max` code points, so an emoji is never cut in half. */
const cutChars = (text: string, max: number) => Array.from(text).slice(0, max).join('');

/**
 * A submission's fields as `name: value` lines (10 at most, in order) and how many more. With a
 * `budget` (UTF-16 units, so it holds however a service counts), the first line that would pass
 * it and the ones after are left out whole and counted as more.
 */
export function formLines(
  fields: Array<[string, string]>,
  locale: ApiLocale,
  escape: (text: string) => string,
  budget = Number.POSITIVE_INFINITY,
): string[] {
  const lines: string[] = [];
  let used = 0;
  for (const [name, value] of fields.slice(0, FORM_FIELDS_SHOWN)) {
    const line = `${escape(oneLine(name, FORM_NAME_CHARS))}: ${escape(oneLine(value, FORM_VALUE_CHARS))}`;
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  const more = fields.length - lines.length;
  if (more > 0) {
    const one = more === 1;
    const noun =
      locale === 'es' ? `${one ? 'campo' : 'campos'} más` : `more ${one ? 'field' : 'fields'}`;
    lines.push(`+${more} ${noun}`);
  }
  return lines;
}

/** The body posted to a channel of `kind` for a form submission (JSON). */
function formPayload(
  kind: Exclude<CloudNotifyKind, 'EMAIL'>,
  e: FormEvent,
  locale: ApiLocale,
): string {
  if (kind === 'WEBHOOK') return JSON.stringify(e);
  const es = locale === 'es';
  const icon = e.event === 'test' ? '🔔' : '📨';
  const test = e.event === 'test' ? (es ? 'prueba: ' : 'test: ') : '';
  const what = es ? 'nuevo envío en' : 'new submission to';
  const label = es ? 'Ver los envíos' : 'See the submissions';
  if (kind === 'SLACK') {
    const text = [
      `${icon} *${slackEscape(e.project.name)}* · ${test}${what} *${slackEscape(e.form.name)}*`,
      ...formLines(e.submission.fields, locale, slackEscape),
      `<${e.submission.url}|${label}>`,
    ].join('\n');
    return JSON.stringify({ text, unfurl_links: false, unfurl_media: false });
  }
  const lines = formLines(e.submission.fields, locale, discordEscape, DISCORD_LINES_BUDGET);
  return JSON.stringify({
    username: 'Codeqlick Cloud',
    // Visitors write these values: never let them ping anyone.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        // Titles show no markdown and mention nobody: they go as they are.
        title: cutChars(`${icon} ${e.project.name} · ${test}${what} ${e.form.name}`, 256),
        url: e.submission.url,
        description: [...lines, `[${label}](${e.submission.url})`].join('\n'),
        color: 0xd9177e,
        timestamp: e.sentAt,
      },
    ],
  });
}

/** The body posted to a channel of `kind` (JSON). */
export function payload(
  kind: Exclude<CloudNotifyKind, 'EMAIL'>,
  e: AnyNotifyEvent,
  locale: ApiLocale,
): string {
  if ('submission' in e) return formPayload(kind, e, locale);
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

export type MonitorEventName = 'monitor.down' | 'monitor.up' | 'monitor.cert';

/** What a Slack, Discord or webhook channel is told when a monitor of its project alerts. */
export interface MonitorNotifyEvent {
  event: MonitorEventName;
  project: { slug: string; name: string };
  monitor: { id: string; name: string; kind: 'HTTP' | 'HEARTBEAT'; url: string | null };
  error: string | null;
  downMinutes: number | null;
  certExpiresAt: string | null;
  consoleUrl: string;
  sentAt: string;
}

/** A monitor alert as channels receive it: each field only where the spec gives it. */
export function monitorEvent(input: {
  kind: 'down' | 'up' | 'cert';
  project: { slug: string; name: string };
  monitor: { id: string; name: string; kind: 'HTTP' | 'HEARTBEAT'; url: string | null };
  error: string | null;
  minutes?: number;
  certExpires?: Date;
  consoleUrl: string;
  now?: Date;
}): MonitorNotifyEvent {
  return {
    event: `monitor.${input.kind}`,
    project: { slug: input.project.slug, name: input.project.name },
    monitor: {
      id: input.monitor.id,
      name: input.monitor.name,
      kind: input.monitor.kind,
      url: input.monitor.kind === 'HTTP' ? input.monitor.url : null,
    },
    error: input.kind === 'cert' ? null : input.error,
    downMinutes: input.kind === 'up' ? (input.minutes ?? null) : null,
    certExpiresAt: input.kind === 'cert' ? (input.certExpires?.toISOString() ?? null) : null,
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

const monitorIcon = (e: MonitorNotifyEvent) =>
  e.event === 'monitor.down' ? '🔴' : e.event === 'monitor.up' ? '🟢' : '⚠️';

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
          color:
            e.event === 'monitor.down' ? 0xd92d20 : e.event === 'monitor.up' ? 0x12b76a : 0xf79009,
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

/** A sample form submission for "Send a test" (decision 63). */
export function testFormEvent(
  project: { slug: string; name: string },
  formsUrl: string,
  locale: ApiLocale,
  now = new Date(),
): FormEvent {
  const es = locale === 'es';
  return {
    event: 'test',
    project,
    form: { id: '00000000-0000-0000-0000-000000000000', name: es ? 'Contacto' : 'Contact' },
    submission: {
      id: '00000000-0000-0000-0000-000000000000',
      fields: [
        [es ? 'nombre' : 'name', 'Ada Lovelace'],
        ['email', 'ada@example.com'],
        [
          es ? 'mensaje' : 'message',
          es
            ? 'Un envío de ejemplo de Codeqlick Cloud.'
            : 'A sample submission from Codeqlick Cloud.',
        ],
      ],
      email: 'ada@example.com',
      page: null,
      createdAt: now.toISOString(),
      url: formsUrl,
    },
    sentAt: now.toISOString(),
  };
}
