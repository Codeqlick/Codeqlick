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
import { MarkdownImageButton } from '@/components/app/MarkdownImageButton';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { MAX_IMAGE_BYTES } from '@/lib/api/media';
import type { AdminPost } from '@/lib/api/types';
import { uploadImageAction } from '../actions';

const STATUSES = ['DRAFT', 'PUBLISHED'] as const;

/** Create/edit form for a blog post with its English and (optional) Spanish translations. */
export async function PostForm({
  locale,
  action,
  post,
}: {
  locale: AppLocale;
  action: FormAction;
  post?: AdminPost;
}) {
  const t = await getTranslations({ locale, namespace: 'Admin.posts' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tm = await getTranslations({ locale, namespace: 'Admin.media' });
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
          defaultValue={post?.slug}
        />
        <FormSelect
          name="status"
          label={t('status')}
          options={STATUSES.map((value) => ({ value, label: ts(value) }))}
          defaultValue={post?.status ?? 'DRAFT'}
        />
      </div>
      <ImageField
        name="coverImageUrl"
        label={t('coverImageUrl')}
        optionalLabel={tc('optional')}
        defaultValue={post?.coverImageUrl ?? ''}
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

      {(['en', 'es'] as const).map((lang) => {
        const translation = post?.translations.find((item) => item.locale === lang);
        return (
          <fieldset key={lang} className={styles.fieldset} lang={lang}>
            <legend>{lang === 'en' ? t('translationEn') : t('translationEs')}</legend>
            <FormInput
              name={`${lang}.title`}
              label={t('postTitle')}
              required={lang === 'en'}
              defaultValue={translation?.title}
            />
            <FormTextarea
              name={`${lang}.excerpt`}
              label={t('excerpt')}
              rows={3}
              required={lang === 'en'}
              defaultValue={translation?.excerpt}
            />
            <FormTextarea
              name={`${lang}.content`}
              label={t('content')}
              rows={16}
              mono
              required={lang === 'en'}
              defaultValue={translation?.content}
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
          </fieldset>
        );
      })}

      <div className={styles.actions}>
        <SubmitButton pendingLabel={post ? tc('saving') : tc('creating')}>
          {post ? tc('save') : tc('create')}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
