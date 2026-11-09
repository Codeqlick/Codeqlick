import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getVideochatUser, SUSPENSION_DURATIONS } from '@/lib/api/videochat';
import { formatDateTime } from '@/lib/format';
import { countryName, languageName } from '@/lib/videochat-options';
import {
  ageVerifiedAction,
  liftSuspensionAction,
  revokeVerificationAction,
  suspendUserAction,
} from '../../actions';

type PageProps = { params: Promise<{ locale: string; id: string }> };

/** One person in the video chat: profile, status, reports, sanctions and appeals. */
export default async function AdminVideochatUserPage({ params }: PageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'AdminVideochat' });
  const tu = await getTranslations({ locale, namespace: 'AdminVideochat.user' });
  const tg = await getTranslations({ locale, namespace: 'Videochat.genders' });
  const back = { href: '/admin/videochat', label: tu('back') };

  const person = await getVideochatUser(id);
  if (!person) {
    return (
      <>
        <PageHeader title={tu('title')} back={back} />
        <Alert tone="error">{tu('notFound')}</Alert>
      </>
    );
  }

  const { profile, suspension } = person;
  const none = '—';
  const durations = SUSPENSION_DURATIONS.map((value) => ({
    value,
    label: t(`durations.${value}`),
  }));
  const facts: Array<[string, string]> = [
    [tu('email'), person.user.email],
    [tu('nickname'), profile.nickname ?? none],
    [tu('gender'), profile.gender ? tg(profile.gender) : none],
    [
      tu('seeking'),
      profile.seeking.length ? profile.seeking.map((g) => tg(g)).join(', ') : tu('anyone'),
    ],
    [
      tu('country'),
      profile.country
        ? `${countryName(profile.country, locale)}${profile.sameCountryOnly ? ` (${tu('only')})` : ''}`
        : none,
    ],
    [
      tu('language'),
      profile.language
        ? `${languageName(profile.language, locale)}${profile.sameLanguageOnly ? ` (${tu('only')})` : ''}`
        : none,
    ],
    [tu('joined'), formatDateTime(person.onboardedAt, locale)],
    [tu('account'), formatDateTime(person.user.createdAt, locale)],
  ];

  return (
    <div className={styles.stack}>
      <PageHeader title={person.user.name} lead={tu('lead')} back={back} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tu('status')}</h2>
        <p>
          {suspension ? (
            <>
              <Badge tone="danger">{t('suspendedBadge')}</Badge>{' '}
              {tu('suspendedSince', { date: formatDateTime(suspension.since, locale) })} ·{' '}
              {suspension.until
                ? t('until', { date: formatDateTime(suspension.until, locale) })
                : t('durations.permanent')}
              {suspension.reason ? ` · ${suspension.reason}` : ''}
            </>
          ) : (
            <Badge tone="success">{tu('active')}</Badge>
          )}{' '}
          {person.ageVerified ? (
            <Badge tone="success">{tu('ageVerified')}</Badge>
          ) : (
            <Badge>{tu('ageDeclared')}</Badge>
          )}{' '}
          {person.photoVerification === 'APPROVED' ? (
            <Badge tone="success">{tu('photoVerified')}</Badge>
          ) : person.photoVerification === 'PENDING' ? (
            <Badge>{tu('photoPending')}</Badge>
          ) : null}
        </p>
        <div className={styles.actions}>
          {suspension ? (
            <ActionForm action={liftSuspensionAction.bind(null, locale, id)}>
              <SubmitButton size="sm" variant="outline">
                {t('lift')}
              </SubmitButton>
            </ActionForm>
          ) : null}
          <ActionForm action={ageVerifiedAction.bind(null, locale, id, !person.ageVerified)}>
            <SubmitButton size="sm" variant="outline">
              {person.ageVerified ? tu('unverifyAge') : tu('verifyAge')}
            </SubmitButton>
          </ActionForm>
          {person.photoVerification === 'APPROVED' ? (
            <ActionForm action={revokeVerificationAction.bind(null, locale, id)}>
              <SubmitButton size="sm" variant="outline">
                {tu('revokeBadge')}
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
        <hr className={styles.divider} />
        <ActionForm action={suspendUserAction.bind(null, locale, id)} className={styles.form}>
          <h3 className={styles.updateTitle}>
            {suspension ? tu('changeSuspension') : tu('suspend')}
          </h3>
          <div className={styles.row}>
            <FormInput name="reason" label={tu('reason')} maxLength={500} required />
            <FormSelect
              name="duration"
              label={t('duration')}
              options={durations}
              defaultValue="24h"
            />
          </div>
          <div className={styles.actions}>
            <SubmitButton size="sm" variant="danger">
              {tu('suspend')}
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tu('profile')}</h2>
        <dl className={styles.facts}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tu('sanctions')}</h2>
        {person.sanctions.length === 0 ? (
          <p className={styles.muted}>{tu('noSanctions')}</p>
        ) : (
          <ul className={styles.simpleList}>
            {person.sanctions.map((sanction) => (
              <li key={sanction.id}>
                <strong>{tu(`kinds.${sanction.kind}`)}</strong> ·{' '}
                {formatDateTime(sanction.createdAt, locale)} ·{' '}
                {sanction.by ? sanction.by.name : tu('automatic')}
                {sanction.kind === 'SUSPENDED'
                  ? ` · ${
                      sanction.until
                        ? t('until', { date: formatDateTime(sanction.until, locale) })
                        : t('durations.permanent')
                    }`
                  : ''}
                {sanction.reason ? ` · ${sanction.reason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tu('appeals')}</h2>
        {person.appeals.length === 0 ? (
          <p className={styles.muted}>{tu('noAppeals')}</p>
        ) : (
          <ul className={styles.updates}>
            {person.appeals.map((appeal) => (
              <li key={appeal.id} className={styles.update}>
                <p className={styles.muted}>
                  {formatDateTime(appeal.createdAt, locale)} · {tu(`appealStatus.${appeal.status}`)}
                </p>
                <p className={styles.prewrap}>{appeal.message}</p>
                {appeal.response ? (
                  <p className={styles.prewrap}>
                    <strong>{t('appealResponse')}:</strong> {appeal.response}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tu('reportsReceived')}</h2>
        {person.reportsReceived.length === 0 ? (
          <p className={styles.muted}>{tu('noReports')}</p>
        ) : (
          <ul className={styles.simpleList}>
            {person.reportsReceived.map((report) => (
              <li key={report.id}>
                <strong>{t(`reasons.${report.reason}`)}</strong> ·{' '}
                {formatDateTime(report.createdAt, locale)} · {t(`tabs.${report.status}`)} ·{' '}
                <Link href={`/admin/videochat/users/${report.reporter.id}`}>
                  {report.reporter.name}
                </Link>
                {report.details ? ` · ${report.details}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tu('reportsMade')}</h2>
        {person.reportsMade.length === 0 ? (
          <p className={styles.muted}>{tu('noReports')}</p>
        ) : (
          <ul className={styles.simpleList}>
            {person.reportsMade.map((report) => (
              <li key={report.id}>
                <strong>{t(`reasons.${report.reason}`)}</strong> ·{' '}
                {formatDateTime(report.createdAt, locale)} · {t(`tabs.${report.status}`)} ·{' '}
                <Link href={`/admin/videochat/users/${report.reported.id}`}>
                  {report.reported.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
