import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import {
  exportCloudAnalytics,
  listCloudProjects,
  type CloudAnalyticsPeriod,
} from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { redirectTo } from '@/lib/redirect';

type Params = { locale: string; team: string; project: string };

const PERIODS: readonly CloudAnalyticsPeriod[] = ['24h', '7d', '30d', '90d', '365d'];

/** A project's web analytics as CSV (architecture 4.13, Web analytics), through the BFF. */
export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { locale, team, project: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });
  const requested = new URL(request.url).searchParams.get('period');
  const period = PERIODS.find((item) => item === requested) ?? '7d';
  let csv: string;
  try {
    const project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) return new Response('Not found', { status: 404 });
    csv = await exportCloudAnalytics(project.id, period);
  } catch (error) {
    if (isApiError(error) && error.status === 401) return redirectTo(`/${locale}/login`);
    if (isApiError(error) && error.status === 404)
      return new Response('Not found', { status: 404 });
    if (isApiError(error) && error.status === 429)
      return new Response('Too many exports, try again in a minute.', { status: 429 });
    return new Response('The export failed. Please try again.', { status: 502 });
  }
  // fetch's text() drops the API's byte order mark; Excel needs it to read accents as UTF-8.
  const body = csv.startsWith('﻿') ? csv : `﻿${csv}`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-analytics-${period}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
