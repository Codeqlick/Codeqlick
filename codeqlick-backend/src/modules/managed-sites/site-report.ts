import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import { madridInstant, madridParts } from '../projects/digest-schedule.js';

/** The monthly report goes out on the 1st from this hour, Madrid time. */
export const REPORT_HOUR = 9;
/** From this day of the month a report waiting for Umami goes out without visits. */
export const REPORT_UMAMI_GRACE_DAY = 3;

export interface ReportPeriod {
  /** `yyyy-mm`: the month reported. */
  month: string;
  /** Its first and last days, `yyyy-mm-dd`. */
  first: string;
  last: string;
  /** Madrid midnights: the month is [start, end). */
  start: Date;
  end: Date;
  days: number;
  /** Today's day of the month in Madrid. */
  today: number;
  /** Whether this month's run may start (from the 1st at REPORT_HOUR). */
  open: boolean;
}

/** The month before the one `now` is in (Madrid), the one its report covers. */
export function reportPeriod(now: Date): ReportPeriod {
  const today = madridParts(now);
  const year = today.month === 1 ? today.year - 1 : today.year;
  const month = today.month === 1 ? 12 : today.month - 1;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const key = `${year}-${String(month).padStart(2, '0')}`;
  return {
    month: key,
    first: `${key}-01`,
    last: `${key}-${String(days).padStart(2, '0')}`,
    start: madridInstant(year, month, 1, 0),
    end: madridInstant(today.year, today.month, 1, 0),
    days,
    today: today.day,
    open: today.day > 1 || today.hour >= REPORT_HOUR,
  };
}

export interface SiteReport {
  projectId: string;
  /** The site's address, as people know it. */
  site: string;
  month: string;
  /** Null without statistics (Umami not set up or not answering). */
  visits: {
    visitors: number;
    pageviews: number;
    previousVisitors: number;
    sources: Array<{ source: string; visitors: number }>;
  } | null;
  messages: number;
  /** 0–1, or null without checks. */
  uptime: number | null;
}

const monthName = (month: string, locale: ApiLocale) =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${month}-15T12:00:00Z`));

const number = (value: number, locale: ApiLocale) =>
  new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB').format(value);

const percent = (ratio: number, locale: ApiLocale, digits = 1) =>
  new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(ratio);

/** "+12 % vs August", or null when there is nothing to compare with. */
function trend(report: SiteReport, locale: ApiLocale): string | null {
  const visits = report.visits;
  if (!visits || visits.previousVisitors === 0) return null;
  const change = (visits.visitors - visits.previousVisitors) / visits.previousVisitors;
  const [year, month] = report.month.split('-').map(Number) as [number, number];
  const previous = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`;
  const sign = change > 0 ? '+' : '';
  return locale === 'es'
    ? `${sign}${percent(change, locale, 0)} respecto a ${monthName(previous, locale)}`
    : `${sign}${percent(change, locale, 0)} on ${monthName(previous, locale)}`;
}

/** The monthly report of a client's website (architecture 8.2). */
export function siteReportEmail(
  person: { name: string; email: string; locale: ApiLocale },
  report: SiteReport,
  urls: { project: string; account: string; site: string },
) {
  const locale = person.locale;
  const es = locale === 'es';
  const month = monthName(report.month, locale);
  const visits = report.visits;
  const change = trend(report, locale);
  const details: Array<[string, string]> = [];
  if (visits) {
    details.push([
      es ? 'Personas que la visitaron' : 'People who visited it',
      `${number(visits.visitors, locale)}${change ? ` (${change})` : ''}`,
    ]);
    details.push([es ? 'Páginas vistas' : 'Page views', number(visits.pageviews, locale)]);
  }
  details.push([
    es ? 'Mensajes del formulario' : 'Messages through the form',
    number(report.messages, locale),
  ]);
  details.push([
    es ? 'Tiempo en línea' : 'Time online',
    report.uptime === null ? (es ? 'Sin datos' : 'No data') : percent(report.uptime, locale),
  ]);
  if (visits && visits.sources.length > 0) {
    details.push([
      es ? 'De dónde llegaron' : 'Where they came from',
      visits.sources.map((item) => `${item.source} (${number(item.visitors, locale)})`).join(', '),
    ]);
  }

  return {
    to: person.email,
    subject: visits
      ? es
        ? `Tu web en ${month}: ${number(visits.visitors, locale)} visitantes`
        : `Your website in ${month}: ${number(visits.visitors, locale)} visitors`
      : es
        ? `Tu web en ${month}`
        : `Your website in ${month}`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Así le fue a ${report.site} en ${month}.`
          : `How ${report.site} did in ${month}.`,
        title: es ? `Tu web en ${month}` : `Your website in ${month}`,
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: [
          es
            ? `Así le fue a ${report.site} el mes pasado:`
            : `Here is how ${report.site} did last month:`,
        ],
        details,
        button: {
          label: es ? 'Ver las estadísticas' : 'See the statistics',
          url: urls.project,
        },
        outro: [
          es
            ? '¿Quieres cambiar algo de tu web, como el horario, los precios o las fotos? Hazlo desde tu área de cliente o responde a este correo.'
            : 'Want to change something on your website, like the hours, prices or photos? Do it from your client area or reply to this email.',
        ],
        note: es
          ? `¿Prefieres no recibir este informe? Desactívalo en tu cuenta: ${urls.account}`
          : `Rather not get this report? Turn it off in your account: ${urls.account}`,
      },
      urls.site,
    ),
  };
}
