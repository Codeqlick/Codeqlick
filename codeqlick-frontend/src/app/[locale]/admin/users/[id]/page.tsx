import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { DeleteForm } from '@/components/app/DeleteForm';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { adminGetUser, adminListUsers } from '@/lib/api/users';
import { getCurrentUser } from '@/lib/auth/session';
import { Link } from '@/i18n/navigation';
import { EMAIL_LOCALES, ROLES } from '@/lib/schemas/admin';
import {
  addCompanyPersonAction,
  deleteUserAction,
  resetPasswordAction,
  sendInvitationAction,
  sendWeeklyDigestAction,
  updateUserAction,
} from '../actions';

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tpr = await getTranslations({ locale, namespace: 'Admin.proposals' });
  const tr = await getTranslations({ locale, namespace: 'Roles' });
  const tl = await getTranslations({ locale, namespace: 'LocaleSwitcher' });
  const back = { href: '/admin/users', label: t('back') };

  const [user, me] = await Promise.all([adminGetUser(id), getCurrentUser()]);
  if (!user) {
    return (
      <>
        <PageHeader title={t('edit')} back={back} />
        <Alert tone="error">{t('notFound')}</Alert>
      </>
    );
  }

  // A client's main account lists its people; a person links back to it.
  const isAccount = user.role === 'CLIENT' && !user.memberOfId;
  const [people, account] = await Promise.all([
    isAccount
      ? adminListUsers({ memberOf: user.id, pageSize: 100 }).then((page) => page.items)
      : Promise.resolve([]),
    user.memberOfId ? adminGetUser(user.memberOfId) : Promise.resolve(undefined),
  ]);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={user.name}
        lead={user.email}
        back={back}
        actions={
          isAccount ? (
            <Button href={`/admin/proposals/new?client=${user.id}`} variant="outline" size="sm">
              {tpr('newForClient')}
            </Button>
          ) : undefined
        }
      />

      {account ? (
        <Alert tone="info">
          {t('memberOf')} <Link href={`/admin/users/${account.id}`}>{account.name}</Link>
        </Alert>
      ) : null}

      {isAccount ? (
        <section className={styles.panel} id="people" aria-labelledby="people-heading">
          <h2 id="people-heading" className={styles.panelTitle}>
            {t('peopleTitle')}
          </h2>
          <div className={styles.stack}>
            <p className={styles.muted}>{t('peopleLead')}</p>
            {people.length > 0 ? (
              <ul className={styles.files}>
                {people.map((person) => (
                  <li key={person.id} className={styles.fileRow}>
                    <div className={styles.fileInfo}>
                      <Link href={`/admin/users/${person.id}`} className={styles.fileName}>
                        {person.name}
                      </Link>
                      <span className={styles.muted}>{person.email}</span>
                    </div>
                    {person.isActive ? null : <span className={styles.muted}>{t('inactive')}</span>}
                  </li>
                ))}
              </ul>
            ) : null}
            <details className={styles.commentForm}>
              <summary>{t('addPerson')}</summary>
              <ActionForm
                key={people.length}
                action={addCompanyPersonAction.bind(null, locale, user.id)}
                className={styles.form}
              >
                <div className={styles.row}>
                  <FormInput id="person-name" name="name" label={t('name')} required />
                  <FormInput
                    id="person-email"
                    name="email"
                    type="email"
                    label={t('email')}
                    required
                  />
                </div>
                <FormSelect
                  id="person-locale"
                  name="locale"
                  label={t('locale')}
                  hint={t('personLocaleHint')}
                  options={EMAIL_LOCALES.map((value) => ({ value, label: tl(value) }))}
                  defaultValue={user.locale}
                />
                <div className={styles.actions}>
                  <SubmitButton pendingLabel={t('personAdding')}>
                    {t('addPersonButton')}
                  </SubmitButton>
                </div>
              </ActionForm>
            </details>
          </div>
        </section>
      ) : null}

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
          <FormSelect
            name="locale"
            label={t('locale')}
            hint={t('localeHint')}
            options={EMAIL_LOCALES.map((value) => ({ value, label: tl(value) }))}
            defaultValue={user.locale}
          />
          <FormCheckbox
            name="isActive"
            label={t('isActive')}
            hint={t('isActiveHint')}
            defaultChecked={user.isActive}
          />
          {user.role === 'CLIENT' ? (
            <>
              <FormCheckbox
                name="weeklyDigest"
                label={t('weeklyDigest')}
                hint={t('weeklyDigestHint')}
                defaultChecked={user.weeklyDigest}
              />
              <FormCheckbox
                name="monthlyReport"
                label={t('monthlyReport')}
                hint={t('monthlyReportHint')}
                defaultChecked={user.monthlyReport}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="weeklyDigest" value={user.weeklyDigest ? 'on' : ''} />
              <input type="hidden" name="monthlyReport" value={user.monthlyReport ? 'on' : ''} />
            </>
          )}
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {user.isActive && user.role === 'CLIENT' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('digest')}</h2>
          <ActionForm
            action={sendWeeklyDigestAction.bind(null, locale, user.id)}
            className={styles.form}
          >
            <p className={styles.muted}>{t('digestBody', { language: tl(user.locale) })}</p>
            <div className={styles.actions}>
              <SubmitButton variant="outline" pendingLabel={t('digestSending')}>
                {t('digestSend')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      {user.isActive && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {user.registered ? t('invitation') : t('signupInvitation')}
          </h2>
          <ActionForm
            action={sendInvitationAction.bind(null, locale, user.id)}
            className={styles.form}
          >
            <p className={styles.muted}>
              {user.registered
                ? t('invitationBody', { language: tl(user.locale) })
                : t('signupInvitationBody', { language: tl(user.locale) })}
            </p>
            <div className={styles.actions}>
              <SubmitButton variant="outline" pendingLabel={t('invitationSending')}>
                {t('invitationSend')}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      )}

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

      {me?.id === user.id ? null : user.owns && user.owns.projects > 0 ? (
        <section className={`${styles.panel} ${styles.dangerPanel}`}>
          <h2 className={styles.panelTitle}>{t('deleteTitle')}</h2>
          <p className={styles.muted}>{t('deleteBlocked', { count: user.owns.projects })}</p>
        </section>
      ) : (
        <DeleteForm
          action={deleteUserAction.bind(null, locale, user.id)}
          title={t('deleteTitle')}
          body={t('deleteBody', {
            members: user.owns?.members ?? 0,
            proposals: user.owns?.proposals ?? 0,
            tickets: user.owns?.tickets ?? 0,
          })}
          confirmText={user.email}
        />
      )}
    </div>
  );
}
