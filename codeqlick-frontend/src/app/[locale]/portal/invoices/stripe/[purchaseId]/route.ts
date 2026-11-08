import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { stripeInvoicePdf } from '@/lib/api/invoices';
import { redirectTo } from '@/lib/redirect';

/** Sends the browser to the PDF of the invoice Stripe issued for a website bought online. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; purchaseId: string }> },
) {
  const { locale, purchaseId } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });
  try {
    const { url } = await stripeInvoicePdf(purchaseId);
    // Only Stripe's own addresses: the API passes on what Stripe answered.
    if (!/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(url)) {
      return new Response('Not found', { status: 404 });
    }
    return redirectTo(url, 303);
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) {
      return redirectTo(
        `/${locale}/login?next=${encodeURIComponent(`/${locale}/portal/invoices`)}`,
      );
    }
    if (isApiError(error) && (error.status === 400 || error.status === 404)) {
      return new Response('Not found', { status: 404 });
    }
    return new Response('The invoice is not available right now. Please try again.', {
      status: 502,
    });
  }
}
