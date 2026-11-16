import { getTranslations } from 'next-intl/server';
import {
  cruisingPushSubscribeAction,
  cruisingPushUnsubscribeAction,
  profileAction,
} from '@/app/[locale]/cruising/actions';
import { finishTourAction } from '@/app/[locale]/cruising/onboarding-actions';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import { PushToggle } from '@/components/videochat/PushToggle';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { siteLocale, type AppLocale } from '@/i18n/routing';
import { listCruisingFavorites, type CruisingStatus } from '@/lib/api/cruising';
import { listCruisingSuggestions } from '@/lib/api/cruising-stats';
import { CRUISING_COUNTRIES, countryName, formatRating, spotHref, type Bbox } from '@/lib/cruising';
import styles from './CruisingTour.module.css';
import { FavoriteStar } from './FavoriteStar';
import { TourSteps, type TourStepContent } from './TourSteps';

/**
 * The onboarding tour (decision 102), shown on the map after entering until it is finished or
 * skipped: a nickname, favourites from suggested spots, notifications on this device, and a photo
 * or the verification (both optional). Each step reuses what /me does; it reopens from there.
 */
export async function OnboardingTour({
  locale,
  status,
  near,
}: {
  locale: AppLocale;
  status: CruisingStatus;
  /** The map's view on the grid, to suggest spots near it; none: the member's country. */
  near: Bbox | null;
}) {
  const t = await getTranslations({ locale, namespace: 'Cruising.tour' });
  const tm = await getTranslations({ locale, namespace: 'Cruising.me' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const ts = await getTranslations({ locale, namespace: 'Cruising.spot' });
  const tp = await getTranslations({ locale, namespace: 'Cruising.push' });
  const profile = status.profile;
  const [suggestions, favorites] = await Promise.all([
    listCruisingSuggestions(near).catch(() => null),
    listCruisingFavorites().catch(() => []),
  ]);
  const saved = new Set(favorites.map((favorite) => favorite.spot.id));
  const countries = CRUISING_COUNTRIES.map((code) => ({
    value: code,
    label: countryName(code, locale),
  })).toSorted((a, b) => a.label.localeCompare(b.label, locale));

  const steps: TourStepContent[] = [
    {
      id: 'nickname',
      title: t('nicknameTitle'),
      content: (
        <>
          <p>{profile ? t('nicknameDone', { nickname: profile.nickname }) : t('nicknameLead')}</p>
          {/* The /me profile form's action: the fields not shown here keep their values. */}
          <ActionForm action={profileAction.bind(null, locale)} className={styles.body}>
            <FormInput
              id="tour-nickname"
              name="nickname"
              label={tm('nickname')}
              hint={profile ? tm('nicknameChange') : tm('nicknameHint')}
              defaultValue={profile?.nickname ?? ''}
              minLength={3}
              maxLength={20}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <FormSelect
              id="tour-country"
              name="country"
              label={tm('country')}
              hint={t('countryHint')}
              optionalLabel={tm('optional')}
              placeholder={tm('countryNone')}
              options={countries}
              defaultValue={profile?.country ?? ''}
            />
            <input type="hidden" name="bio" value={profile?.bio ?? ''} />
            {(profile?.lookingFor ?? []).map((value) => (
              <input key={value} type="hidden" name="lookingFor" value={value} />
            ))}
            {(profile?.showAge ?? true) ? <input type="hidden" name="showAge" value="on" /> : null}
            <SubmitButton size="sm" pendingLabel={tm('saving')}>
              {tm('save')}
            </SubmitButton>
          </ActionForm>
        </>
      ),
    },
    {
      id: 'favorites',
      title: t('favoritesTitle'),
      content: (
        <>
          <p>{near ? t('favoritesLeadNear') : t('favoritesLead')}</p>
          {suggestions === null ? (
            <p>{t('suggestionsError')}</p>
          ) : suggestions.length === 0 ? (
            <p>
              {t('suggestionsEmpty')} <Link href="/cruising/places">{t('browsePlaces')}</Link>
            </p>
          ) : (
            <ul className={styles.suggestions}>
              {suggestions.map((spot) => (
                <li key={spot.id} className={styles.suggestion}>
                  <h4 className={styles.suggestionName}>
                    <Link href={spotHref(spot.slug)}>{spot.name}</Link>
                  </h4>
                  <p>
                    {tt(spot.type)} ·{' '}
                    {spot.ratingCount > 0
                      ? ts('rating', {
                          rating: formatRating(spot.ratingAvg),
                          count: spot.ratingCount,
                        })
                      : ts('noRatings')}
                  </p>
                  <FavoriteStar locale={locale} spotId={spot.id} saved={saved.has(spot.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    {
      id: 'notifications',
      title: t('notificationsTitle'),
      content: (
        <>
          <p>{tp('lead')}</p>
          {status.pushPublicKey ? (
            <PushToggle
              publicKey={status.pushPublicKey}
              locale={siteLocale(locale)}
              serviceWorker="/cruising-sw.js"
              namespace="Cruising.push"
              subscribe={cruisingPushSubscribeAction}
              unsubscribe={cruisingPushUnsubscribeAction}
            />
          ) : (
            <p>{tp('unavailable')}</p>
          )}
        </>
      ),
    },
    {
      id: 'profile',
      title: t('profileTitle'),
      content: (
        <>
          <p>{t('profileLead')}</p>
          <p className={styles.links}>
            {profile ? <Link href="/cruising/me#me-media">{t('addPhoto')}</Link> : null}
            {status.verified ? (
              <span>{t('verifiedAlready')}</span>
            ) : profile ? (
              <Link href="/cruising/me#me-verification">{t('verify')}</Link>
            ) : (
              <span>{t('profileNeedsNickname')}</span>
            )}
          </p>
        </>
      ),
    },
  ];

  return <TourSteps steps={steps} finish={finishTourAction.bind(null, locale)} />;
}
