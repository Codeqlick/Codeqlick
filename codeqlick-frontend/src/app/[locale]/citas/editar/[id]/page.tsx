import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listCitasPages, type CitasPage } from '@/lib/api/citas';
import { intervalsToText, WEEKDAYS } from '@/lib/booking';
import { CITAS_DURATIONS, CITAS_TIME_ZONES, zoneCity } from '@/lib/citas';
import { savePageAction } from '../../actions';
import styles from '../../citas.module.css';

type PageProps = { params: Promise<{ locale: string; id: string }> };

export const metadata: Metadata = { robots: { index: false } };

const NEW_PAGE: Omit<CitasPage, 'id' | 'meetingCode' | 'upcoming' | 'createdAt'> = {
  slug: '',
  title: '',
  description: '',
  durationMinutes: 30,
  location: '',
  video: false,
  askPhone: false,
  timeZone: 'Europe/Madrid',
  weekly: {
    mon: [{ start: '09:00', end: '14:00' }],
    tue: [{ start: '09:00', end: '14:00' }],
    wed: [{ start: '09:00', end: '14:00' }],
    thu: [{ start: '09:00', end: '14:00' }],
    fri: [{ start: '09:00', end: '14:00' }],
    sat: [],
    sun: [],
  },
  minNoticeHours: 12,
  horizonDays: 30,
  enabled: true,
};

/** Creates (`nueva`) or edits one of the signed-in person's booking pages. */
export default async function CitasEditorPage({ params }: PageProps) {
  const { locale: raw, id } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: 'Citas.editor' });
  const tw = await getTranslations({ locale, namespace: 'Citas.weekdays' });
  const isNew = id === 'nueva';
  const existing = isNew ? null : (await listCitasPages()).find((page) => page.id === id);
  if (!isNew && !existing) notFound();
  const page = existing ?? NEW_PAGE;
  const action = savePageAction.bind(null, locale, existing?.id ?? null);

  return (
    <div className={styles.editor}>
      <div>
        <Link href="/citas" className={styles.link}>
          ← {t('back')}
        </Link>
        <h1 className={styles.heroTitle} style={{ marginTop: 'var(--space-4)' }}>
          {isNew ? t('newTitle') : t('editTitle')}
        </h1>
      </div>

      <ActionForm action={action} className={styles.editor}>
        <div className={`${styles.card} ${styles.form}`}>
          <FormInput
            name="title"
            label={t('title')}
            placeholder={t('titlePlaceholder')}
            maxLength={80}
            required
            defaultValue={page.title}
          />
          <FormInput
            name="slug"
            label={t('slug')}
            hint={`citas.codeqlick.com/${locale}/citas/… · ${t('slugHint')}`}
            maxLength={40}
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={page.slug}
          />
          <FormTextarea
            name="description"
            label={t('description')}
            hint={t('descriptionHint')}
            rows={3}
            maxLength={500}
            defaultValue={page.description}
          />
          <div className={styles.row}>
            <FormSelect
              name="durationMinutes"
              label={t('duration')}
              options={CITAS_DURATIONS.map((value) => ({
                value: String(value),
                label: `${value} min`,
              }))}
              defaultValue={String(page.durationMinutes)}
            />
            <FormSelect
              name="timeZone"
              label={t('timeZone')}
              options={CITAS_TIME_ZONES.map((zone) => ({ value: zone, label: zoneCity(zone) }))}
              defaultValue={page.timeZone}
            />
          </div>
          <FormInput
            name="location"
            label={t('location')}
            placeholder={t('locationPlaceholder')}
            hint={t('locationHint')}
            maxLength={200}
            defaultValue={page.location}
          />
          <FormCheckbox
            name="video"
            label={t('video')}
            hint={t('videoHint')}
            defaultChecked={page.video}
          />
          <FormCheckbox name="askPhone" label={t('askPhone')} defaultChecked={page.askPhone} />
        </div>

        <fieldset className={`${styles.card} ${styles.fieldset}`}>
          <legend className={styles.legend}>{t('hoursTitle')}</legend>
          <p className={styles.muted}>{t('hoursLead')}</p>
          <div className={styles.days7}>
            {WEEKDAYS.map((day) => (
              <FormInput
                key={day}
                name={`day.${day}`}
                label={tw(day)}
                placeholder="09:00-14:00, 16:00-19:00"
                defaultValue={intervalsToText(page.weekly[day])}
              />
            ))}
          </div>
          <div className={styles.row}>
            <FormInput
              name="minNoticeHours"
              type="number"
              min={0}
              max={720}
              label={t('notice')}
              hint={t('noticeHint')}
              defaultValue={String(page.minNoticeHours)}
            />
            <FormInput
              name="horizonDays"
              type="number"
              min={1}
              max={180}
              label={t('horizon')}
              defaultValue={String(page.horizonDays)}
            />
          </div>
          <FormCheckbox
            name="enabled"
            label={t('enabled')}
            hint={t('enabledHint')}
            defaultChecked={page.enabled}
          />
        </fieldset>

        <div>
          <SubmitButton pendingLabel={t('saving')}>{isNew ? t('create') : t('save')}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
