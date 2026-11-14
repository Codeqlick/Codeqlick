'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createNewsAction,
  deleteNewsAction,
  listNewsAction,
  publishNewsAction,
  setNewsEnabledAction,
  unpublishNewsAction,
  updateNewsAction,
  type NewsFailure,
  type NewsResult,
} from '@/app/[locale]/portal/projects/[id]/site/editor/news-actions';
import { uploadEditorPhotoAction } from '@/app/[locale]/portal/projects/[id]/site/editor/actions';
import { Badge } from '@/components/ui/Badge';
import type { AppLocale } from '@/i18n/routing';
import type { NewsScope } from '@/lib/api/site-news';
import type { SiteNewsBuild, SiteNewsList, SiteNewsPost, SiteNewsStatus } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/format';
import { photoUrl } from './fields';
import {
  EMPTY_NEWS_FORM,
  NEWS_LIMITS,
  expiryDay,
  madridDay,
  newsChanged,
  newsFieldOf,
  newsPayload,
  newsProblems,
  type NewsForm,
  type NewsProblem,
} from './news';
import { NewsMarkdown } from './news-markdown';
import editor from './SiteEditor.module.css';
import styles from './SiteNews.module.css';

const TONES = { DRAFT: 'neutral', PUBLISHED: 'success', EXPIRED: 'warning' } as const;

type Notice = { tone: 'ok' | 'warn' | 'error'; text: string };
type Editing = { id: string | null; status: SiteNewsStatus | null };
type Errors = Partial<Record<keyof NewsForm, string>>;

function formOf(post: SiteNewsPost): NewsForm {
  return {
    title: post.title,
    summary: post.summary,
    body: post.body,
    photo: post.photo?.file ?? '',
    expiresAt: expiryDay(post.expiresAt),
  };
}

/**
 * The "Noticias" part of the website editor and of the admin's project page (architecture 8.2):
 * the section's switch, the posts and the form to write one. Posts have their own save button:
 * they are not part of the editor's draft. In the admin (`scope="admin"`) a post's photo can be
 * kept or taken off, but not uploaded: uploads belong to the client's own routes.
 */
export function SiteNews({
  locale,
  scope,
  projectId,
  initial,
}: {
  locale: AppLocale;
  scope: NewsScope;
  projectId: string;
  initial: SiteNewsList;
}) {
  const t = useTranslations('SiteNews');
  const ids = useId();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [posts, setPosts] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState<NewsForm>(EMPTY_NEWS_FORM);
  const [saved, setSaved] = useState<NewsForm>(EMPTY_NEWS_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoProblem, setPhotoProblem] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const today = madridDay(new Date());
  const canUpload = scope === 'portal';
  const changed = editing ? newsChanged(form, saved) : false;

  const limits: Partial<Record<keyof NewsForm, number>> = NEWS_LIMITS;
  const problemText = (problem: NewsProblem, field: keyof NewsForm) =>
    t(`errors.${problem}`, { max: limits[field] ?? 0 });

  const failure = (reason: NewsFailure): Notice => ({
    tone: 'error',
    text: t(`failures.${reason}`),
  });

  /** Shows what went wrong, putting the API's field messages beside their fields. */
  const fail = (result: Extract<NewsResult<unknown>, { ok: false }>) => {
    const fields: Errors = {};
    for (const [path, message] of Object.entries(result.errors)) {
      const field = newsFieldOf(path, message);
      if (field && !fields[field]) fields[field] = t('errors.invalid');
    }
    if (result.reason === 'invalid' && Object.keys(fields).length === 0 && result.message) {
      const field = newsFieldOf('', result.message);
      if (field) fields[field] = t('errors.invalid');
    }
    setErrors(fields);
    setNotice(failure(result.reason));
  };

  const buildNotice = (
    post: SiteNewsPost,
    build: SiteNewsBuild | undefined,
    done: 'saved' | 'published' | 'unpublished',
  ): Notice => {
    if (build === 'FAILED') return { tone: 'warn', text: t('buildFailed') };
    if (build === 'OK') return { tone: 'ok', text: t(`${done}Built`) };
    if (done === 'saved' && post.status === 'DRAFT') return { tone: 'ok', text: t('savedDraft') };
    return { tone: 'ok', text: t(`${done}Pending`) };
  };

  const put = (post: SiteNewsPost) =>
    setPosts((current) =>
      current.some((item) => item.id === post.id)
        ? current.map((item) => (item.id === post.id ? post : item))
        : [post, ...current],
    );

  const open = (post: SiteNewsPost | null) => {
    if (changed && !window.confirm(t('discardConfirm'))) return;
    const next = post ? formOf(post) : EMPTY_NEWS_FORM;
    setEditing({ id: post?.id ?? null, status: post?.status ?? null });
    setForm(next);
    setSaved(next);
    setErrors({});
    setNotice(null);
    setPhotoProblem(false);
  };

  const close = () => {
    if (changed && !window.confirm(t('discardConfirm'))) return;
    setEditing(null);
    setErrors({});
  };

  const set = (field: keyof NewsForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  /** Checks the form; true when it can be sent. */
  const check = (publishing = false) => {
    const problems = newsProblems(form, today, publishing);
    const fields: Errors = {};
    for (const [field, problem] of Object.entries(problems) as [keyof NewsForm, NewsProblem][])
      fields[field] = problemText(problem, field);
    setErrors(fields);
    if (Object.keys(fields).length > 0) {
      setNotice({ tone: 'error', text: t('failures.invalid') });
      return false;
    }
    return true;
  };

  /** Saves the form: a new post is created as a draft, an existing one updated. */
  const save = async (): Promise<SiteNewsPost | null> => {
    if (!editing || !check()) return null;
    const input = newsPayload(form);
    setBusy(true);
    const result = editing.id
      ? await updateNewsAction(locale, scope, projectId, editing.id, input)
      : await createNewsAction(locale, scope, projectId, input);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return null;
    }
    put(result.data);
    if (!editing.id) setTotal((count) => count + 1);
    setEditing({ id: result.data.id, status: result.data.status });
    setSaved(form);
    setErrors({});
    setNotice(buildNotice(result.data, result.build, 'saved'));
    return result.data;
  };

  const publish = async () => {
    if (!editing || !check(true)) return;
    setBusy(true);
    setNotice(null);
    // A new post is saved first; an existing one is saved by the publish call with its edits.
    let id = editing.id;
    let input: ReturnType<typeof newsPayload> | null = changed ? newsPayload(form) : null;
    if (!id) {
      const created = await createNewsAction(locale, scope, projectId, newsPayload(form));
      if (!created.ok) {
        setBusy(false);
        fail(created);
        return;
      }
      put(created.data);
      setTotal((count) => count + 1);
      setEditing({ id: created.data.id, status: created.data.status });
      id = created.data.id;
      input = null;
    }
    const result = await publishNewsAction(locale, scope, projectId, id, input);
    setBusy(false);
    if (!result.ok) {
      // The edits may have been saved even so; the form keeps what the client typed.
      fail(result);
      return;
    }
    put(result.data);
    setEditing({ id: result.data.id, status: result.data.status });
    setSaved(form);
    setErrors({});
    setNotice(buildNotice(result.data, result.build, 'published'));
  };

  const unpublish = async () => {
    if (!editing?.id) return;
    const wasLive = editing.status === 'PUBLISHED';
    setBusy(true);
    const result = await unpublishNewsAction(locale, scope, projectId, editing.id);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    put(result.data);
    setEditing({ id: result.data.id, status: result.data.status });
    setNotice(
      wasLive
        ? buildNotice(result.data, result.build, 'unpublished')
        : { tone: 'ok', text: t('unpublishedPlain') },
    );
  };

  const remove = async () => {
    if (!editing?.id || !window.confirm(t('deleteConfirm', { title: saved.title || form.title })))
      return;
    const id = editing.id;
    setBusy(true);
    const result = await deleteNewsAction(locale, scope, projectId, id);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    setPosts((current) => current.filter((item) => item.id !== id));
    setTotal((count) => Math.max(0, count - 1));
    setEditing(null);
    setNotice({ tone: 'ok', text: t('deleted') });
  };

  const toggle = async (next: boolean) => {
    setBusy(true);
    const result = await setNewsEnabledAction(locale, scope, projectId, next);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    setEnabled(result.data.enabled);
    setNotice({ tone: 'ok', text: t(result.data.enabled ? 'switchedOn' : 'switchedOff') });
  };

  const more = async () => {
    setBusy(true);
    const result = await listNewsAction(locale, scope, projectId, page + 1);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    setPage(result.data.page);
    setTotal(result.data.total);
    setPosts((current) => [
      ...current,
      ...result.data.items.filter((item) => !current.some((known) => known.id === item.id)),
    ]);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setPhotoProblem(false);
    const body = new FormData();
    body.append('photo', file);
    const result = await uploadEditorPhotoAction(locale, projectId, body);
    setUploading(false);
    if ('file' in result) set('photo', result.file);
    else setPhotoProblem(true);
  };

  const field = (name: keyof NewsForm) => `${ids}-${name}`;
  const status = editing?.status ?? null;

  return (
    <div className={styles.news}>
      <section className={styles.panel} aria-labelledby={`${ids}-switch`}>
        <h2 id={`${ids}-switch`} className={styles.heading}>
          {t('title')}
        </h2>
        <p className={editor.hint}>{t('lead')}</p>
        <label className={editor.check}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) => void toggle(event.target.checked)}
          />
          {t('switch')}
        </label>
        <p className={editor.hint}>{enabled ? t('switchOn') : t('switchOff')}</p>
      </section>

      {notice ? (
        notice.tone === 'error' ? (
          <p className={editor.banner} role="alert">
            {notice.text}
          </p>
        ) : (
          <output className={notice.tone === 'ok' ? editor.bannerOk : editor.banner}>
            {notice.text}
          </output>
        )
      ) : null}

      {editing ? (
        <section className={styles.panel} aria-labelledby={`${ids}-form`}>
          <div className={styles.bar}>
            <h3 id={`${ids}-form`} className={styles.heading}>
              {editing.id ? t('editPost') : t('newPost')}
            </h3>
            {status ? <Badge tone={TONES[status]}>{t(`statuses.${status}`)}</Badge> : null}
          </div>
          <div className={styles.columns}>
            <form
              className={styles.form}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className={editor.field}>
                <label htmlFor={field('title')} className={editor.label}>
                  {t('fieldTitle')}
                </label>
                <input
                  id={field('title')}
                  className={editor.input}
                  maxLength={NEWS_LIMITS.title}
                  value={form.title}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? `${field('title')}-error` : undefined}
                  onChange={(event) => set('title', event.target.value)}
                />
                {errors.title ? (
                  <p id={`${field('title')}-error`} className={editor.error} role="alert">
                    {errors.title}
                  </p>
                ) : null}
              </div>

              <div className={editor.field}>
                <label htmlFor={field('summary')} className={editor.label}>
                  {t('fieldSummary')}
                </label>
                <textarea
                  id={field('summary')}
                  className={editor.input}
                  rows={3}
                  maxLength={NEWS_LIMITS.summary}
                  value={form.summary}
                  aria-invalid={errors.summary ? true : undefined}
                  aria-describedby={`${field('summary')}-hint${errors.summary ? ` ${field('summary')}-error` : ''}`}
                  onChange={(event) => set('summary', event.target.value)}
                />
                <p id={`${field('summary')}-hint`} className={editor.hint}>
                  {t('summaryHint', { count: form.summary.length, max: NEWS_LIMITS.summary })}
                </p>
                {errors.summary ? (
                  <p id={`${field('summary')}-error`} className={editor.error} role="alert">
                    {errors.summary}
                  </p>
                ) : null}
              </div>

              <div className={editor.field}>
                <label htmlFor={field('body')} className={editor.label}>
                  {t('fieldBody')}
                </label>
                <textarea
                  id={field('body')}
                  className={editor.input}
                  rows={10}
                  maxLength={NEWS_LIMITS.body}
                  value={form.body}
                  aria-invalid={errors.body ? true : undefined}
                  aria-describedby={errors.body ? `${field('body')}-error` : undefined}
                  onChange={(event) => set('body', event.target.value)}
                />
                {errors.body ? (
                  <p id={`${field('body')}-error`} className={editor.error} role="alert">
                    {errors.body}
                  </p>
                ) : null}
                <details className={styles.help}>
                  <summary>{t('helpTitle')}</summary>
                  <ul>
                    <li>{t('helpParagraphs')}</li>
                    <li>
                      <code>**{t('helpBoldExample')}**</code> {t('helpBold')}
                    </li>
                    <li>
                      <code>*{t('helpItalicExample')}*</code> {t('helpItalic')}
                    </li>
                    <li>
                      <code>[{t('helpLinkExample')}](https://…)</code> {t('helpLink')}
                    </li>
                    <li>
                      <code>- {t('helpListExample')}</code> {t('helpList')}
                    </li>
                  </ul>
                </details>
              </div>

              <div className={editor.photoField}>
                <p className={editor.label}>{t('fieldPhoto')}</p>
                <div className={editor.photoRow}>
                  {form.photo ? (
                    // oxlint-disable-next-line nextjs/no-img-element -- uploads come from the media route
                    <img src={photoUrl(form.photo, '')} alt="" className={editor.thumb} />
                  ) : (
                    <span className={editor.thumbEmpty}>{t('noPhoto')}</span>
                  )}
                  <div className={editor.photoActions}>
                    {canUpload ? (
                      <>
                        <input
                          ref={fileInput}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          aria-label={t('fieldPhoto')}
                          onChange={(event) => {
                            void pick(event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          className={editor.small}
                          disabled={uploading || busy}
                          onClick={() => fileInput.current?.click()}
                        >
                          {uploading
                            ? t('uploading')
                            : form.photo
                              ? t('changePhoto')
                              : t('addPhoto')}
                        </button>
                      </>
                    ) : null}
                    {form.photo ? (
                      <button
                        type="button"
                        className={editor.link}
                        onClick={() => set('photo', '')}
                      >
                        {t('removePhoto')}
                      </button>
                    ) : null}
                  </div>
                </div>
                {!canUpload ? <p className={editor.hint}>{t('photoAdminHint')}</p> : null}
                {photoProblem ? (
                  <p className={editor.error} role="alert">
                    {t('photoFailed')}
                  </p>
                ) : null}
              </div>

              <div className={editor.field}>
                <label htmlFor={field('expiresAt')} className={editor.label}>
                  {t('fieldExpires')}
                </label>
                <input
                  id={field('expiresAt')}
                  type="date"
                  className={editor.input}
                  value={form.expiresAt}
                  min={today}
                  aria-invalid={errors.expiresAt ? true : undefined}
                  aria-describedby={`${field('expiresAt')}-hint${errors.expiresAt ? ` ${field('expiresAt')}-error` : ''}`}
                  onChange={(event) => set('expiresAt', event.target.value)}
                />
                <p id={`${field('expiresAt')}-hint`} className={editor.hint}>
                  {t('expiresHint')}
                </p>
                {!errors.expiresAt && form.expiresAt && form.expiresAt < today ? (
                  <p className={editor.hint}>{t('pastHint')}</p>
                ) : null}
                {errors.expiresAt ? (
                  <p id={`${field('expiresAt')}-error`} className={editor.error} role="alert">
                    {errors.expiresAt}
                  </p>
                ) : null}
              </div>

              <div className={styles.actions}>
                <button type="submit" className={editor.small} disabled={busy || !changed}>
                  {busy ? t('saving') : status === 'DRAFT' || !status ? t('saveDraft') : t('save')}
                </button>
                {status !== 'PUBLISHED' && status !== 'EXPIRED' ? (
                  <button
                    type="button"
                    className={editor.primary}
                    disabled={busy}
                    onClick={() => void publish()}
                  >
                    {t('publish')}
                  </button>
                ) : (
                  <>
                    {status === 'EXPIRED' && changed ? (
                      <button
                        type="button"
                        className={editor.primary}
                        disabled={busy}
                        onClick={() => void publish()}
                      >
                        {t('publishAgain')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={editor.small}
                      disabled={busy}
                      onClick={() => void unpublish()}
                    >
                      {t('unpublish')}
                    </button>
                  </>
                )}
                {editing.id ? (
                  <button
                    type="button"
                    className={editor.link}
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    {t('delete')}
                  </button>
                ) : null}
                <button type="button" className={editor.link} onClick={close}>
                  {t('close')}
                </button>
              </div>
              {status === 'EXPIRED' ? <p className={editor.hint}>{t('expiredHint')}</p> : null}
            </form>

            <section className={styles.preview} aria-labelledby={`${ids}-preview`}>
              <h4 id={`${ids}-preview`} className={editor.label}>
                {t('previewTitle')}
              </h4>
              <p className={editor.hint}>{t('previewHint')}</p>
              {form.title.trim() || form.summary.trim() || form.body.trim() ? (
                <article className={styles.article}>
                  {form.photo ? (
                    // oxlint-disable-next-line nextjs/no-img-element -- uploads come from the media route
                    <img src={photoUrl(form.photo, '')} alt="" className={styles.cover} />
                  ) : null}
                  {form.title.trim() ? <h5>{form.title}</h5> : null}
                  {form.summary.trim() ? <p className={styles.summary}>{form.summary}</p> : null}
                  <NewsMarkdown source={form.body} className={styles.body} />
                </article>
              ) : (
                <p className={editor.hint}>{t('previewEmpty')}</p>
              )}
            </section>
          </div>
        </section>
      ) : (
        <section className={styles.panel} aria-labelledby={`${ids}-list`}>
          <div className={styles.bar}>
            <h3 id={`${ids}-list`} className={styles.heading}>
              {t('listTitle', { count: total })}
            </h3>
            <button type="button" className={editor.primary} onClick={() => open(null)}>
              {t('newPost')}
            </button>
          </div>
          {posts.length === 0 ? (
            <p className={editor.hint}>{t('empty')}</p>
          ) : (
            <ul className={styles.list}>
              {posts.map((post) => (
                <li key={post.id} className={styles.item}>
                  <div className={styles.itemText}>
                    <strong>{post.title}</strong>
                    <span className={editor.hint}>
                      {post.publishedAt
                        ? t('publishedOn', { date: formatDateTime(post.publishedAt, locale) })
                        : t('createdOn', { date: formatDateTime(post.createdAt, locale) })}
                      {post.expiresAt
                        ? ` · ${t('expiresOn', { date: formatDate(post.expiresAt, locale) })}`
                        : ''}
                    </span>
                  </div>
                  <Badge tone={TONES[post.status]}>{t(`statuses.${post.status}`)}</Badge>
                  <button type="button" className={editor.small} onClick={() => open(post)}>
                    {t('edit')}
                    <span className={styles.visuallyHidden}> {post.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {posts.length < total ? (
            <button
              type="button"
              className={editor.small}
              disabled={busy}
              onClick={() => void more()}
            >
              {t('more')}
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}
