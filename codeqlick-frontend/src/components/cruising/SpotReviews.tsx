import { getTranslations } from 'next-intl/server';
import { CruisingGate } from '@/app/[locale]/cruising/Gate';
import { deleteReviewAction, reviewAction } from '@/app/[locale]/cruising/actions';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import { ActionForm, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { Pagination } from '@/components/ui/Pagination';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import {
  listCruisingReviews,
  type CruisingSpotPublic,
  type CruisingStatus,
} from '@/lib/api/cruising';
import { isApiError } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import { LIMITS, memberHref } from '@/lib/cruising';
import styles from './Cruising.module.css';
import { MemberName } from './MemberName';
import { ReportDetails } from './ReportDetails';

const PAGE_SIZE = 20;

/** `★★★☆☆`, for the eyes only: the number is said in words next to it. */
function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className={styles.stars}>
      <span aria-hidden="true">{'★'.repeat(rating) + '☆'.repeat(5 - rating)}</span>
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

type SpotReviewsProps = {
  locale: AppLocale;
  spot: CruisingSpotPublic;
  /** Whether someone is signed in, and their Cruising state (null: signed out or not asked). */
  signedIn: boolean;
  status: CruisingStatus | null;
  page: number;
};

/**
 * A spot's reviews: only for members who have entered (the public page shows just the average and
 * the count). Signed-out people are asked to sign in; the others see the entry step first.
 */
export async function SpotReviews({ locale, spot, signedIn, status, page }: SpotReviewsProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.reviews' });
  const here = `/${locale}/cruising/spots/${spot.slug}`;

  if (signedIn && !status) return null; // Cruising's state couldn't be read: the page still works.
  if (!signedIn || !status) {
    return (
      <section className={styles.section} aria-labelledby="reviews-title">
        <h2 id="reviews-title" className={vc.sectionTitle}>
          {t('title')}
        </h2>
        <p className={vc.muted}>
          {t('signInLead')}{' '}
          <Link href={`/login?next=${encodeURIComponent(here)}`} className={vc.inlineLink}>
            {t('signIn')}
          </Link>
        </p>
      </section>
    );
  }

  const gate = await CruisingGate({ locale, status, inline: true });
  if (gate) {
    return (
      <section className={styles.section} aria-label={t('title')}>
        {gate}
      </section>
    );
  }

  let list: Awaited<ReturnType<typeof listCruisingReviews>> | null = null;
  try {
    list = await listCruisingReviews(spot.id, page, PAGE_SIZE);
  } catch (error) {
    // Not entered after all (the state moved), or the API had a problem: the page still works.
    if (!isApiError(error)) throw error;
  }
  const mine = list?.items.find((review) => review.mine);
  const ratings = [5, 4, 3, 2, 1].map((value) => ({
    value: String(value),
    label: t(`ratingOptions.${value as 1 | 2 | 3 | 4 | 5}`),
  }));

  return (
    <section className={styles.section} aria-labelledby="reviews-title">
      <h2 id="reviews-title" className={vc.sectionTitle}>
        {t('title')}
      </h2>

      <div className={styles.reviewForm}>
        <h3 className={styles.subTitle}>{mine ? t('editTitle') : t('writeTitle')}</h3>
        <ActionForm action={reviewAction.bind(null, locale, spot.id)} className={vc.form}>
          <FormSelect
            name="rating"
            label={t('rating')}
            placeholder={t('ratingPlaceholder')}
            options={ratings}
            defaultValue={mine ? String(mine.rating) : ''}
            required
          />
          <FormTextarea
            name="text"
            label={t('text')}
            hint={t('textHint')}
            optionalLabel={t('optional')}
            rows={4}
            maxLength={LIMITS.review}
            defaultValue={mine?.text ?? ''}
          />
          <SubmitButton pendingLabel={t('saving')}>
            {mine ? t('update') : t('publish')}
          </SubmitButton>
        </ActionForm>
        {mine ? (
          <ActionForm action={deleteReviewAction.bind(null, locale, spot.id)} className={vc.form}>
            <SubmitButton variant="outline" size="sm" pendingLabel={t('deleting')}>
              {t('delete')}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>

      {list && list.items.length > 0 ? (
        <ul className={styles.reviews}>
          {list.items.map((review) => (
            <li key={review.id} className={styles.review}>
              <p className={styles.reviewHead}>
                <Stars rating={review.rating} label={t('stars', { count: review.rating })} />
                <span>
                  {review.mine ? (
                    t('you')
                  ) : review.author ? (
                    // A profile needs a nickname of my own: without one the name is only text.
                    <MemberName locale={locale} member={review.author}>
                      {status.profile ? (
                        <Link href={memberHref(review.author.nickname)} className={vc.inlineLink}>
                          {review.author.nickname}
                        </Link>
                      ) : (
                        review.author.nickname
                      )}
                    </MemberName>
                  ) : (
                    t('member')
                  )}
                </span>
                <time dateTime={review.createdAt} className={styles.muted}>
                  {formatDate(review.createdAt, locale)}
                </time>
              </p>
              {review.text ? <p className={styles.reviewText}>{review.text}</p> : null}
              {review.mine ? null : <ReportDetails locale={locale} kind="review" id={review.id} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className={vc.muted}>{t('empty')}</p>
      )}
      {list ? (
        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          pathname={`/cruising/spots/${spot.slug}`}
        />
      ) : null}
    </section>
  );
}
