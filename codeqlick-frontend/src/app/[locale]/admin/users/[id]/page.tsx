import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { adminGetUser } from '@/lib/api/users';
import { ROLES } from '@/lib/schemas/admin';
import { resetPasswordAction, updateUserAction } from '../actions';

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tr = await getTranslations({ locale, namespace: 'Roles' });
  const back = { href: '/admin/users', label: t('back') };

  const user = await adminGetUser(id);
  if (!user) {
    return (
      <>
        <PageHeader title={t('edit')} back={back} />
        <Alert tone="error">{t('notFound')}</Alert>
      </>
    );
  }

  return (
    <div className={styles.stack}>
      <PageHeader title={user.name} lead={user.email} back={back} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('edit')}</h2>
        <ActionForm action={updateUserAction.bind(null, locale, user.id)} className={styles.form}>
          <div className={styles.row}>
            <FormInput name="name" label={t('name')} required defaultValue={user.name} />
            <FormSelect
              name="role"
              label={t('role')}
              options={ROLES.map((value) => ({ value, label: tr(value) }))}
              defaultValue={user.role}
            />
          </div>
          <FormCheckbox
            name="isActive"
            label={t('isActive')}
            hint={t('isActiveHint')}
            defaultChecked={user.isActive}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('resetPassword')}</h2>
        <ActionForm
          action={resetPasswordAction.bind(null, locale, user.id)}
          className={styles.form}
        >
          <p className={styles.muted}>{t('resetPasswordBody')}</p>
          <FormInput
            name="password"
            type="password"
            label={t('newPassword')}
            hint={t('passwordHint')}
            autoComplete="new-password"
            required
          />
          <div className={styles.actions}>
            <SubmitButton variant="outline" pendingLabel={tc('saving')}>
              {t('resetPassword')}
            </SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
