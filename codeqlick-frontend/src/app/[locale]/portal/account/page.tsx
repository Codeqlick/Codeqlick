import { AccountPage } from '@/components/app/AccountPage';
import { resolveLocale } from '@/i18n/locale';

export default async function PortalAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <AccountPage locale={resolveLocale((await params).locale)} />;
}
