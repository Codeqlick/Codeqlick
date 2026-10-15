import { renderEmail, type RenderedEmail } from './email-layout.js';

export type MonitorEmailKind = 'alert' | 'resolved' | 'test';

/**
 * Emails of the server monitor (deploy/monitor/monitor.sh) to the team, in English like the other
 * team notifications, with the same branded layout as the rest.
 */
export function monitorEmail(
  kind: MonitorEmailKind,
  problems: string[],
  host: string,
  siteUrl: string,
): RenderedEmail & { subject: string } {
  const list = problems.map((problem) => `• ${problem}`).join('\n');
  const commands = [
    'docker compose -f docker-compose.prod.yml ps',
    'docker compose -f docker-compose.prod.yml logs --tail 100 <service>',
  ].join('\n');

  if (kind === 'alert') {
    return {
      subject: `[codeqlick] ALERT: ${problems[0] ?? 'something is wrong'}`,
      ...renderEmail(
        {
          locale: 'en',
          preheader: problems[0] ?? 'Something is wrong on the server',
          title: 'Something is wrong on the server',
          intro: [`The server monitor on ${host} found these problems in two checks in a row:`],
          quote: { body: list },
          outro: [`You'll get one more email when everything is back to normal.`],
          note: `To look into it, on the server in /srv/codeqlick:\n${commands}`,
          signoff: [],
        },
        siteUrl,
      ),
    };
  }
  if (kind === 'resolved') {
    return {
      subject: '[codeqlick] Resolved',
      ...renderEmail(
        {
          locale: 'en',
          preheader: 'Everything is back to normal',
          title: 'Back to normal',
          intro: [`Everything on ${host} is working again. The problems were:`],
          quote: { body: list },
          signoff: [],
        },
        siteUrl,
      ),
    };
  }
  return {
    subject: '[codeqlick] Monitor test',
    ...renderEmail(
      {
        locale: 'en',
        preheader: 'Alerts from the server monitor reach this address',
        title: 'Monitor test',
        intro: [
          `This is a test of the server monitor on ${host}: its alerts reach this address.`,
          'It checks the site, the API, every service, the daily backup, disk space and the TLS certificates every 5 minutes, and writes only when something has been broken for 10 minutes and when it is back.',
        ],
        signoff: [],
      },
      siteUrl,
    ),
  };
}
