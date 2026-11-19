import type { ReactNode } from 'react';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppFrame } from '@/components/layout/AppFrame';
import { AppHeader } from '@/components/layout/AppHeader';
import { resolveLocale } from '@/i18n/locale';
import { menuAppMenu } from '@/lib/app-menus';
import { getCurrentUser } from '@/lib/auth/session';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

/** Menu's own frame: Codeqlick's light colours, no site header. */
export default async function MenuAppLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  const user = await getCurrentUser();
  return (
    <AppFrame
      header={
        <AppHeader
          app="menu"
          locale={locale}
          config={menuAppMenu({ signedIn: Boolean(user) })}
          user={user}
        />
      }
      footer={<AppFooter app="menu" locale={locale} />}
    >
      {children}
    </AppFrame>
  );
}
