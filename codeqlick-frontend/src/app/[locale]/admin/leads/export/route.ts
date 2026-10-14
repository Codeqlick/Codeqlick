import { hasLocale } from 'next-intl';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { adminExportLeadsCsv } from '@/lib/api/leads';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/api/types';

/**
 * Downloads the leads as CSV with the list's filters (`?status=&q=`). The proxy has already
 * refreshed the session for this /admin path; the API checks the ADMIN role.
 */
export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });

  const search = new URL(request.url).searchParams;
  const rawStatus = search.get('status');
  const status = LEAD_STATUSES.find((value) => value === rawStatus) as LeadStatus | undefined;
  const q = search.get('q')?.trim() || undefined;

  let csv: string;
  try {
    csv = await adminExportLeadsCsv({ status, q });
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
    return new Response('The export failed. Please try again.', { status: 502 });
  }

  const date = new Date().toISOString().slice(0, 10);
  // fetch's text() drops the API's byte order mark; Excel needs it to read accents as UTF-8.
  const body = csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="codeqlick-leads-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
