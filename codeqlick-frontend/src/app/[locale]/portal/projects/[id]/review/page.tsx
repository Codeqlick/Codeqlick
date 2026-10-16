import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput, FormTextarea } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getMyProject } from '@/lib/api/projects';
import { getMyReview } from '@/lib/api/reviews';
import { getCurrentUser } from '@/lib/auth/session';
import { submitReviewAction } from './actions';
import { RatingField } from './RatingField';

export default async function PortalReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Review' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  let review;
  let project;
  try {
    [review, project] = await Promise.all([getMyReview(id), getMyProject(id)]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  if (review.status === 'NONE') notFound();
  const user = await getCurrentUser();

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={t('lead', { project: project.name })}
        back={{ href: `/portal/projects/${id}`, label: project.name }}
      />
      {review.status !== 'REQUESTED' ? <Alert tone="success">{t('alreadySent')}</Alert> : null}
      <section className={styles.panel}>
        <ActionForm
          key={review.submittedAt ?? 'new'}
          action={submitReviewAction.bind(null, locale, id)}
          className={styles.form}
        >
          <RatingField
            legend={t('rating')}
            starLabel={t('stars', { count: '{count}' })}
            defaultValue={review.rating ?? undefined}
          />
          <FormTextarea
            name="quote"
            label={t('quote')}
            hint={t('quoteHint')}
            rows={5}
            required
            defaultValue={review.quote ?? ''}
          />
          <div className={styles.row}>
            <FormInput
              name="authorName"
              label={t('authorName')}
              required
              defaultValue={review.authorName ?? user?.name ?? ''}
            />
            <FormInput
              name="authorRole"
              label={t('authorRole')}
              optionalLabel={tc('optional')}
              hint={t('authorRoleHint')}
              defaultValue={review.authorRole ?? ''}
            />
          </div>
          <FormCheckbox
            name="consent"
            label={t('consent')}
            hint={t('consentHint')}
            defaultChecked={review.consent}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('sending')}>{t('send')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
