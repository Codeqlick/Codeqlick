/*
 * Builds a server-monitor email as a complete MIME message (branded HTML plus text) and prints it,
 * for deploy/monitor/monitor.sh to send with curl. Runs in the API image without the app:
 *
 *   printf '%s\n' "problem one" "problem two" |
 *     docker compose -f docker-compose.prod.yml run --rm --no-deps -T api \
 *       node dist/scripts/monitor-email.js alert "Codeqlick <hello@…>" admin@… vps-name
 */
import { readFileSync } from 'node:fs';
import { createTransport } from 'nodemailer';
import { monitorEmail, type MonitorEmailKind } from '../modules/mail/monitor-emails.js';

const [kind, from, to, host = 'the server'] = process.argv.slice(2);
if (!kind || !['alert', 'resolved', 'test'].includes(kind) || !from || !to) {
  process.stderr.write(
    'usage: monitor-email.js alert|resolved|test <from> <to> [host] < problems\n',
  );
  process.exit(2);
}

const problems = (kind === 'test' ? '' : readFileSync(0, 'utf8'))
  .split('\n')
  .map((line) => line.replace(/^[-•]\s*/, '').trim())
  .filter(Boolean);
const email = monitorEmail(
  kind as MonitorEmailKind,
  problems,
  host,
  process.env.SITE_URL ?? 'https://codeqlick.com',
);

// streamTransport sends nothing: it hands back the message it would have sent.
const transport = createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
const info = await transport.sendMail({ from, to, ...email });
process.stdout.write(info.message as Buffer);
