import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { ROLES } from '@/lib/schemas/admin';
import { createUserAction } from '../actions';

export default async function NewUserPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tr = await getTranslations({ locale, namespace: 'Roles' });

  return (
    <>
      <PageHeader title={t('new')} back={{ href: '/admin/users', label: t('back') }} />
      <section className={styles.panel}>
        <ActionForm action={createUserAction.bind(null, locale)} className={styles.form}>
          <div className={styles.row}>
            <FormInput name="name" label={t('name')} autoComplete="off" required />
            <FormInput name="email" type="email" label={t('email')} autoComplete="off" required />
          </div>
          <div className={styles.row}>
            <FormSelect
              name="role"
              label={t('role')}
              options={ROLES.map((value) => ({ value, label: tr(value) }))}
              defaultValue="CLIENT"
            />
            <FormInput
              name="password"
              type="password"
              label={t('password')}
              hint={t('passwordHint')}
              autoComplete="new-password"
              required
            />
          </div>
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('creating')}>{tc('create')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
