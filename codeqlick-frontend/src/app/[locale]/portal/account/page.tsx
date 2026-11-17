import { redirect } from 'next/navigation';
import { resolveLocale } from '@/i18n/locale';
import { accountUrl } from '@/lib/account-links';

/** "My account" moved to the account site (account.codeqlick.com, decision 108). */
export default async function MovedAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  redirect(accountUrl(resolveLocale((await params).locale)));
}
