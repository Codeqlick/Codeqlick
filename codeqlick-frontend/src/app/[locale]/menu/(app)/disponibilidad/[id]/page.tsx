import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMenu } from '@/lib/api/menus';
import { setItemFlagAction } from '../../../actions';
import styles from '../../menu.module.css';

type PageProps = { params: Promise<{ locale: string; id: string }> };

export const metadata: Metadata = { robots: { index: false } };

/**
 * The quick availability list, for a phone in the middle of service: every item with two switches
 * (sold out, hidden) that save at once.
 */
export default async function MenuAvailabilityPage({ params }: PageProps) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'Menu.availability' });
  const menu = await getMenu(id).catch((error: unknown) => {
    if (isNotFound(error)) notFound();
    throw error;
  });
  const categories = menu.content.categories.filter((category) => category.items.length > 0);

  const toggle = (key: string, field: 'soldOut' | 'hidden', on: boolean, name: string) => (
    <form action={setItemFlagAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={menu.id} />
      <input type="hidden" name="slug" value={menu.slug} />
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={on ? 'off' : 'on'} />
      <button type="submit" role="switch" aria-checked={on} className={styles.switch}>
        {t(field)}
        <span className="visually-hidden"> — {name}</span>
        <span aria-hidden="true">{on ? t('on') : t('off')}</span>
      </button>
    </form>
  );

  return (
    <div className={styles.stack}>
      <PageHeader
        back={{ href: '/menu', label: t('back') }}
        title={t('title')}
        lead={t('lead', { name: menu.businessName })}
        actions={
          <Button href={`/menu/editar/${menu.id}`} variant="outline" size="sm">
            {t('edit')}
          </Button>
        }
      />
      {menu.suspended ? <Alert tone="error">{t('suspended')}</Alert> : null}
      {categories.length === 0 ? (
        <EmptyState
          headingLevel={2}
          title={t('empty')}
          action={<Button href={`/menu/editar/${menu.id}`}>{t('edit')}</Button>}
        />
      ) : (
        <div className={styles.availability}>
          {categories.map((category, index) => (
            <section
              key={category.key ?? index}
              className={styles.group}
              aria-labelledby={`group-${index}`}
            >
              <h2 id={`group-${index}`} className={styles.groupName}>
                {category.name}
              </h2>
              <ul className={styles.rows}>
                {category.items.map((item, position) => (
                  <li key={item.key ?? position} className={styles.row}>
                    <span className={styles.rowName}>{item.name}</span>
                    {item.key ? (
                      <div className={styles.switches}>
                        {toggle(item.key, 'soldOut', Boolean(item.soldOut), item.name)}
                        {toggle(item.key, 'hidden', Boolean(item.hidden), item.name)}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
