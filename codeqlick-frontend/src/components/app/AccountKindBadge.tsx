import { getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { AdminUser } from '@/lib/api/types';

const TONES: Record<NonNullable<AdminUser['kind']>, BadgeTone> = {
  client: 'brand',
  app: 'neutral',
  none: 'neutral',
};

/**
 * Who the account is for the team (decision 29): administrator, client, user of our web apps or
 * neither yet. Only the type: which apps someone uses isn't shown. Server Component.
 */
export async function AccountKindBadge({ user }: { user: Pick<AdminUser, 'role' | 'kind'> }) {
  const t = await getTranslations('Admin.users.kinds');
  if (user.role === 'ADMIN' || !user.kind) return <Badge tone="ink">{t('admin')}</Badge>;
  return <Badge tone={TONES[user.kind]}>{t(user.kind)}</Badge>;
}
