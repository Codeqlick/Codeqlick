import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { MENU_REPORT_REASONS } from '@/lib/menu';
import { reportMenuAction } from '../../actions';
import styles from '../bare.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ menu?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Menu.report' });
  return { title: { absolute: `${t('title')} — Codeqlick` }, robots: { index: false } };
}

/** The public abuse form for a menu: no sign-in, stored for the team (architecture 4.20). */
export default async function MenuReportPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const slug = ((await searchParams).menu ?? '').slice(0, 80);
  const t = await getTranslations({ locale, namespace: 'Menu.report' });

  return (
    <main className={styles.page}>
      <div className={styles.form}>
        {slug ? (
          <p className={styles.back}>
            <Link href={`/menu/${encodeURIComponent(slug)}`}>{t('back')}</Link>
          </p>
        ) : null}
        <h1 className={styles.formTitle}>{t('title')}</h1>
        <p className={styles.lead}>{t('lead')}</p>
        <ActionForm action={reportMenuAction.bind(null, locale)} className={styles.fields}>
          <FormInput
            name="slug"
            label={t('slug')}
            hint={t('slugHint')}
            required
            defaultValue={slug}
            autoCapitalize="none"
            spellCheck={false}
          />
          <FormSelect
            name="reason"
            label={t('reason')}
            defaultValue="ILLEGAL"
            options={MENU_REPORT_REASONS.map((reason) => ({
              value: reason,
              label: t(`reasons.${reason}`),
            }))}
          />
          <FormTextarea
            name="details"
            label={t('details')}
            hint={t('detailsHint')}
            required
            rows={5}
            maxLength={1000}
          />
          <FormInput
            name="email"
            type="email"
            label={t('email')}
            optionalLabel={t('optional')}
            hint={t('emailHint')}
            autoComplete="email"
          />
          <div className="visually-hidden" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          {/* eslint-disable-next-line react-hooks/purity -- rendered per request: when the form was shown. */}
          <input type="hidden" name="renderedAt" value={Date.now()} />
          <div>
            <SubmitButton pendingLabel={t('sending')}>{t('send')}</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </main>
  );
}
