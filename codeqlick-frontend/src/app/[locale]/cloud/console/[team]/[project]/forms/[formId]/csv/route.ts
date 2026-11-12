import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { exportCloudSubmissions, listCloudProjects } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { redirectTo } from '@/lib/redirect';

type Params = { locale: string; team: string; project: string; formId: string };

/** A form's submissions as CSV (architecture 4.13, Forms), through the BFF. */
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { locale, team, project: slug, formId } = await params;
  if (!hasLocale(routing.locales, locale) || !/^[0-9a-f-]{36}$/.test(formId)) {
    return new Response('Not found', { status: 404 });
  }
  let csv: string;
  try {
    const project = (await listCloudProjects(team)).items.find((item) => item.slug === slug);
    if (!project) return new Response('Not found', { status: 404 });
    csv = await exportCloudSubmissions(project.id, formId);
  } catch (error) {
    if (isApiError(error) && error.status === 401) return redirectTo(`/${locale}/login`);
    if (isApiError(error) && error.status === 404)
      return new Response('Not found', { status: 404 });
    return new Response('The export failed. Please try again.', { status: 502 });
  }
  // fetch's text() drops the API's byte order mark; Excel needs it to read accents as UTF-8.
  const body = csv.startsWith('﻿') ? csv : `﻿${csv}`;
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-form-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
