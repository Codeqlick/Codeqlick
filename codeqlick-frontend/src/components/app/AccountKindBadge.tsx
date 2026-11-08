import { getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { AdminUser } from '@/lib/api/types';

const TONES: Record<NonNullable<AdminUser['kind']>, BadgeTone> = {
  client: 'brand',
  app: 'neutral',
  none: 'neutral',
};

/**
 * Who the account is for the team (decision 29): administrator, client, user of our web
 * apps (named after the badge) or neither yet. Server Component.
 */
export async function AccountKindBadge({
  user,
  withApps = true,
}: {
  user: Pick<AdminUser, 'role' | 'kind' | 'apps'>;
  /** Names the apps it uses after the badge. */
  withApps?: boolean;
}) {
  const t = await getTranslations('Admin.users.kinds');
  const ta = await getTranslations('Apps');
  const apps = user.apps.map((app) => ta(`${app}.title`)).join(', ');
  if (user.role === 'ADMIN' || !user.kind) return <Badge tone="ink">{t('admin')}</Badge>;
  return (
    <>
      <Badge tone={TONES[user.kind]}>{t(user.kind)}</Badge>
      {withApps && apps ? <> {apps}</> : null}
    </>
  );
}
