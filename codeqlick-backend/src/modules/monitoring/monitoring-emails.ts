import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

type Site = { project: string; client: string; url: string };

/** To the team (English): a client site went down, came back, or its certificate is expiring. */
export function siteAlertEmail(
  to: string,
  site: Site,
  event:
    | { kind: 'down'; error: string }
    | { kind: 'up'; downFor: string }
    | { kind: 'cert'; days: number },
  adminUrl: string,
  siteUrl: string,
): MailMessage {
  const subject =
    event.kind === 'down'
      ? `[codeqlick] DOWN: ${site.project} (${site.url})`
      : event.kind === 'up'
        ? `[codeqlick] Back up: ${site.project}`
        : `[codeqlick] Certificate expiring in ${event.days} days: ${site.project}`;
  const intro =
    event.kind === 'down'
      ? `${site.url} (${site.project}, ${site.client}) is not answering: ${event.error}. It failed two checks in a row.`
      : event.kind === 'up'
        ? `${site.url} (${site.project}) is answering again after ${event.downFor}.`
        : `The TLS certificate of ${site.url} (${site.project}) expires in ${event.days} days. Renewal is usually automatic (certbot): check it ran.`;
  return {
    to,
    subject,
    ...renderEmail(
      {
        locale: 'en',
        preheader: intro.slice(0, 120),
        title:
          event.kind === 'down'
            ? 'A client site is down'
            : event.kind === 'up'
              ? 'Back up'
              : 'Certificate expiring',
        intro: [intro],
        button: { label: 'Open the monitoring', url: adminUrl },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
