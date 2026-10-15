import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormInput,
  FormSelect,
  FormTextarea,
  type FormAction,
} from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { ImageField } from '@/components/app/ImageField';
import { MarkdownField } from '@/components/app/MarkdownField';
import { MarkdownImageButton } from '@/components/app/MarkdownImageButton';
import { markdownPreviewLabels } from '@/components/app/markdownPreviewLabels';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { toDateTimeInput } from '@/lib/format';
import { MAX_IMAGE_BYTES } from '@/lib/api/media';
import type { AdminPortfolioItem } from '@/lib/api/types';
import { uploadImageAction } from '../actions';

const STATUSES = ['DRAFT', 'PUBLISHED'] as const;

/** Create/edit form for a case study with its English and (optional) Spanish translations. */
export async function PortfolioForm({
  locale,
  action,
  item,
}: {
  locale: AppLocale;
  action: FormAction;
  item?: AdminPortfolioItem;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.portfolio' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tm = await getTranslations({ locale, namespace: 'Admin.media' });
  const previewLabels = await markdownPreviewLabels(locale);
  const ts = await getTranslations({ locale, namespace: 'PublishStatuses' });

  return (
    <ActionForm action={action} className={styles.form}>
      <div className={styles.row}>
        <FormInput
          name="slug"
          label={t('slug')}
          hint={t('slugHint')}
          mono
          required
          defaultValue={item?.slug}
        />
        <FormSelect
          name="status"
          label={t('status')}
          options={STATUSES.map((value) => ({ value, label: ts(value) }))}
          defaultValue={item?.status ?? 'DRAFT'}
        />
      </div>
      <div className={styles.row}>
        <FormInput
          name="publishedAt"
          type="datetime-local"
          label={t('publishedAt')}
          optionalLabel={tc('optional')}
          hint={t('publishedAtHint')}
          defaultValue={toDateTimeInput(item?.publishedAt)}
        />
      </div>
      <div className={styles.row}>
        <FormInput
          name="clientName"
          label={t('clientName')}
          optionalLabel={tc('optional')}
          defaultValue={item?.clientName ?? ''}
        />
        <FormInput
          name="projectUrl"
          type="url"
          label={t('projectUrl')}
          optionalLabel={tc('optional')}
          defaultValue={item?.projectUrl ?? ''}
        />
      </div>
      <ImageField
        name="coverImageUrl"
        label={t('coverImageUrl')}
        optionalLabel={tc('optional')}
        defaultValue={item?.coverImageUrl ?? ''}
        upload={uploadImageAction.bind(null, locale)}
        maxBytes={MAX_IMAGE_BYTES}
        labels={{
          choose: tm('choose'),
          upload: tm('upload'),
          uploading: tm('uploading'),
          hint: tm('hint'),
          tooLarge: tm('tooLarge'),
          failed: tm('failed'),
        }}
      />
      <div className={styles.row}>
        <FormInput
          name="testimonialAuthor"
          label={t('testimonialAuthor')}
          optionalLabel={tc('optional')}
          hint={t('testimonialAuthorHint')}
          defaultValue={item?.testimonialAuthor ?? ''}
        />
      </div>
      <div className={styles.row}>
        <FormInput
          name="technologies"
          label={t('technologies')}
          hint={t('technologiesHint')}
          defaultValue={item?.technologies.join(', ')}
        />
        <FormInput
          name="sortOrder"
          type="number"
          label={t('sortOrder')}
          hint={t('sortOrderHint')}
          defaultValue={String(item?.sortOrder ?? 0)}
        />
      </div>

      {(['en', 'es'] as const).map((lang) => {
        const translation = item?.translations.find((entry) => entry.locale === lang);
        return (
          <fieldset key={lang} className={styles.fieldset} lang={lang}>
            <legend>{lang === 'en' ? t('translationEn') : t('translationEs')}</legend>
            <FormInput
              name={`${lang}.title`}
              label={t('itemTitle')}
              required={lang === 'en'}
              defaultValue={translation?.title}
            />
            <FormTextarea
              name={`${lang}.summary`}
              label={t('summary')}
              rows={3}
              required={lang === 'en'}
              defaultValue={translation?.summary}
            />
            <MarkdownField
              name={`${lang}.content`}
              label={t('content')}
              rows={16}
              mono
              required={lang === 'en'}
              defaultValue={translation?.content}
              previewLabels={previewLabels}
            />
            <MarkdownImageButton
              target={`${lang}.content`}
              upload={uploadImageAction.bind(null, locale)}
              maxBytes={MAX_IMAGE_BYTES}
              labels={{
                insert: tm('insert'),
                uploading: tm('uploading'),
                choose: tm('choose'),
                altPlaceholder: tm('altPlaceholder'),
                tooLarge: tm('tooLarge'),
                failed: tm('failed'),
              }}
            />
            <FormTextarea
              name={`${lang}.testimonialQuote`}
              label={t('testimonialQuote')}
              optionalLabel={tc('optional')}
              hint={t('testimonialQuoteHint')}
              rows={3}
              defaultValue={translation?.testimonialQuote ?? ''}
            />
            <FormInput
              name={`${lang}.testimonialRole`}
              label={t('testimonialRole')}
              optionalLabel={tc('optional')}
              hint={t('testimonialRoleHint')}
              defaultValue={translation?.testimonialRole ?? ''}
            />
          </fieldset>
        );
      })}

      <div className={styles.actions}>
        <SubmitButton pendingLabel={item ? tc('saving') : tc('creating')}>
          {item ? tc('save') : tc('create')}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
