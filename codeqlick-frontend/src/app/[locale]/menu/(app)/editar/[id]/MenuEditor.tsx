'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { MenuView as MenuPage } from '@/components/menu/MenuView';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import {
  buildMenuLabels,
  contentForApi,
  contentIssueCount,
  defaultTitle,
  languageOfLocale,
  MENU_ALLERGENS,
  MENU_CURRENCIES,
  moveItem,
  normalizeSlugInput,
  suggestSlug,
  type MenuAllergen,
  type MenuCategory,
  type MenuContent,
  type MenuItem,
  type MenuLimits,
  type MenuSettings,
  type MenuView,
} from '@/lib/menu';
import { checkSlugAction, saveMenuAction } from '../../../actions';
import styles from './editor.module.css';

/** A row the editor holds: the API's shape plus an id of its own for React (never sent). */
type EItem = MenuItem & { uid: string };
type ECategory = Omit<MenuCategory, 'items'> & { uid: string; items: EItem[] };

type EditorProps = {
  locale: string;
  /** The menu being edited, or null for a new one. */
  menu: MenuView | null;
  limits: MenuLimits;
  /** The menu host's origin, for the full link. */
  origin: string;
  /** Where "Made with Codeqlick" goes. */
  badgeHref: string;
};

let lastUid = 0;
/** A row id of this page's own (never sent to the API). */
const uid = () => `r${++lastUid}`;

type Notice =
  'saved' | 'invalid' | 'stale' | 'limit' | 'slugLimit' | 'suspended' | 'notFound' | 'failed';

const NEW_SETTINGS = (language: MenuSettings['language']): MenuSettings => ({
  slug: '',
  kind: 'MENU',
  businessName: '',
  language,
  currency: 'EUR',
  title: defaultTitle('MENU', language),
  intro: '',
  address: '',
  openingNote: '',
  note: '',
  enabled: true,
  indexable: true,
});

function settingsOf(menu: MenuView): MenuSettings {
  const { slug, kind, businessName, language, currency, title } = menu;
  return {
    slug,
    kind,
    businessName,
    language,
    currency,
    title,
    intro: menu.intro,
    address: menu.address,
    openingNote: menu.openingNote,
    note: menu.note,
    enabled: menu.enabled,
    indexable: menu.indexable,
  };
}

/** The editor's content as the API takes it, for comparing with what was loaded. */
function plain(categories: ECategory[]): MenuContent {
  return {
    categories: categories.map(({ uid: _uid, items, ...category }) => ({
      ...category,
      items: items.map(({ uid: _itemUid, ...item }) => item),
    })),
  };
}

export function MenuEditor({ locale, menu, limits, origin, badgeHref }: EditorProps) {
  const t = useTranslations('Menu.editor');
  const tm = useTranslations('Menu');
  const labels = useMemo(() => buildMenuLabels((key) => tm(key as never)), [tm]);
  const withUids = (content: MenuContent): ECategory[] =>
    content.categories.map((category) => ({
      ...category,
      uid: uid(),
      items: category.items.map((item) => ({ ...item, uid: uid() })),
    }));

  const [settings, setSettings] = useState<MenuSettings>(() =>
    menu ? settingsOf(menu) : NEW_SETTINGS(languageOfLocale(locale)),
  );
  const [categories, setCategories] = useState<ECategory[]>(() =>
    withUids(menu?.content ?? { categories: [{ name: '', items: [{ name: '' }] }] }),
  );
  const [revision, setRevision] = useState(menu?.revision ?? 0);
  // What was loaded or last saved: what "unsaved changes" compares with.
  const [saved, setSaved] = useState(() => ({
    settings: JSON.stringify(menu ? settingsOf(menu) : null),
    content: JSON.stringify(menu ? contentForApi(menu.content, menu.kind) : null),
    slug: menu?.slug ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [slugTouched, setSlugTouched] = useState(Boolean(menu));
  const [titleTouched, setTitleTouched] = useState(Boolean(menu));
  const [pending, startTransition] = useTransition();
  const [check, setCheck] = useState<{
    slug: string;
    result: { available: boolean; reason?: 'taken' | 'reserved' | 'invalid' } | null;
  } | null>(null);

  const isNew = !menu;
  const settingsDirty = isNew || JSON.stringify(settings) !== saved.settings;
  const contentDirty =
    isNew || JSON.stringify(contentForApi(plain(categories), settings.kind)) !== saved.content;
  const dirty = settingsDirty || contentDirty;

  // Unsaved changes warn before leaving.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The link's live check, a moment after the person stops typing.
  const slug = settings.slug;
  const slugChanged = slug !== saved.slug;
  useEffect(() => {
    if (!slugChanged || slug.length < 3) return;
    const timer = window.setTimeout(() => {
      void checkSlugAction(slug, menu?.id ?? null).then((result) => setCheck({ slug, result }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [slug, slugChanged, menu?.id]);
  const slugCheck = check?.slug === slug ? check.result : null;

  const change = (patch: Partial<MenuSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setNotice(null);
  };

  const setBusinessName = (name: string) => {
    change({ businessName: name, ...(slugTouched ? {} : { slug: suggestSlug(name) }) });
  };

  const setKindOrLanguage = (patch: Partial<Pick<MenuSettings, 'kind' | 'language'>>) => {
    const next = { ...settings, ...patch };
    change({
      ...patch,
      ...(titleTouched ? {} : { title: defaultTitle(next.kind, next.language) }),
    });
  };

  // Content edits. Moving, adding and removing shift the rows: errors by position no longer apply.
  const structure = (update: (list: ECategory[]) => ECategory[]) => {
    setCategories(update);
    setErrors({});
    setNotice(null);
  };
  const editCategory = (index: number, patch: Partial<ECategory>) => {
    setCategories((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setNotice(null);
  };
  const editItem = (index: number, position: number, patch: Partial<EItem>) => {
    setCategories((list) =>
      list.map((category, i) =>
        i === index
          ? {
              ...category,
              items: category.items.map((item, p) =>
                p === position ? { ...item, ...patch } : item,
              ),
            }
          : category,
      ),
    );
    setNotice(null);
  };
  const toggleAllergen = (index: number, position: number, allergen: MenuAllergen, on: boolean) => {
    const current = categories[index]?.items[position]?.allergens ?? [];
    const next = MENU_ALLERGENS.filter((a) => (a === allergen ? on : current.includes(a)));
    editItem(index, position, { allergens: next.length > 0 ? next : undefined });
  };

  const save = () => {
    const clientErrors: Record<string, string> = {};
    if (!settings.businessName.trim()) clientErrors.businessName = t('issues.required');
    if (slug.length < 3) clientErrors.slug = t('issues.invalid');
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setNotice('invalid');
      return;
    }
    setErrors({});
    setNotice(null);
    startTransition(async () => {
      const result = await saveMenuAction(locale, {
        id: menu?.id ?? null,
        revision,
        settings,
        content: contentForApi(plain(categories), settings.kind),
        changed: { settings: settingsDirty, content: contentDirty },
      });
      if (result.ok) {
        const next = result.menu;
        setSettings(settingsOf(next));
        setCategories(withUids(next.content));
        setRevision(next.revision);
        setSaved({
          settings: JSON.stringify(settingsOf(next)),
          content: JSON.stringify(contentForApi(next.content, next.kind)),
          slug: next.slug,
        });
        setNotice('saved');
        return;
      }
      setErrors(result.errors);
      setNotice(result.reason);
    });
  };

  const contentErrors = contentIssueCount(errors);
  const atCategoryLimit = categories.length >= limits.categories;
  const name = (value: string, n: number, key: 'categoryN' | 'itemN') =>
    value.trim() || t(key, { n });

  const previewMenu = {
    ...settings,
    showBadge: limits.showBadge,
    content: plain(categories),
  };
  const fullLink = `${origin.replace(/\/$/, '')}/${slug || '…'}`;

  const slugStatus = slugChanged
    ? slugCheck
      ? slugCheck.available
        ? t('slugAvailable')
        : t(`issues.${slugCheck.reason === 'invalid' ? 'invalid' : (slugCheck.reason ?? 'taken')}`)
      : slug.length >= 3
        ? t('slugChecking')
        : null
    : null;
  const slugUnavailable = slugCheck?.available === false;

  const notices: Record<Notice, { tone: 'success' | 'error'; text: string }> = {
    saved: { tone: 'success', text: t('saved') },
    invalid: { tone: 'error', text: t('invalid') },
    stale: { tone: 'error', text: t('stale') },
    limit: { tone: 'error', text: t('limit') },
    slugLimit: { tone: 'error', text: t('slugLimit') },
    suspended: { tone: 'error', text: t('suspended') },
    notFound: { tone: 'error', text: t('notFound') },
    failed: { tone: 'error', text: t('failed') },
  };
  const shown = notice ? notices[notice] : null;

  return (
    <form
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      noValidate
    >
      <fieldset className={styles.viewSwitch}>
        <legend className="visually-hidden">{t('viewLabel')}</legend>
        <button
          type="button"
          aria-pressed={view === 'edit'}
          className={styles.viewButton}
          onClick={() => setView('edit')}
        >
          {t('tabEdit')}
        </button>
        <button
          type="button"
          aria-pressed={view === 'preview'}
          className={styles.viewButton}
          onClick={() => setView('preview')}
        >
          {t('tabPreview')}
        </button>
      </fieldset>

      <div className={styles.layout} data-view={view}>
        <div className={styles.fields} data-panel="edit">
          <section className={styles.card} aria-labelledby="menu-business">
            <h2 id="menu-business" className={styles.cardTitle}>
              {t('businessTitle')}
            </h2>
            <Input
              id="menu-name"
              label={t('businessName')}
              value={settings.businessName}
              maxLength={80}
              required
              autoComplete="organization"
              error={errors.businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            <div className={styles.row}>
              <Select
                id="menu-kind"
                label={t('kind')}
                value={settings.kind}
                options={[
                  { value: 'MENU', label: t('kindMenu') },
                  { value: 'CATALOGUE', label: t('kindCatalogue') },
                ]}
                onChange={(event) =>
                  setKindOrLanguage({ kind: event.target.value as MenuSettings['kind'] })
                }
              />
              <Select
                id="menu-language"
                label={t('language')}
                value={settings.language}
                hint={t('languageHint')}
                options={[
                  { value: 'EN', label: 'English' },
                  { value: 'ES', label: 'Español' },
                ]}
                error={errors.language}
                onChange={(event) =>
                  setKindOrLanguage({ language: event.target.value as MenuSettings['language'] })
                }
              />
            </div>
            <Input
              id="menu-slug"
              label={t('slug')}
              value={slug}
              maxLength={40}
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              mono
              hint={
                <>
                  {t('slugHint')} <strong>{fullLink}</strong>
                  {slugStatus ? (
                    <output className={slugUnavailable ? styles.bad : styles.ok}>
                      {' · '}
                      {slugStatus}
                    </output>
                  ) : null}
                </>
              }
              error={errors.slug}
              onChange={(event) => {
                setSlugTouched(true);
                change({ slug: normalizeSlugInput(event.target.value) });
              }}
            />
            {!isNew && slugChanged ? <Alert tone="warning">{t('slugChange')}</Alert> : null}
            <div className={styles.row}>
              <Select
                id="menu-currency"
                label={t('currency')}
                value={settings.currency}
                options={MENU_CURRENCIES.map((code) => ({ value: code, label: code }))}
                error={errors.currency}
                onChange={(event) =>
                  change({ currency: event.target.value as MenuSettings['currency'] })
                }
              />
              <Input
                id="menu-title"
                label={t('title')}
                value={settings.title}
                maxLength={80}
                error={errors.title}
                onChange={(event) => {
                  setTitleTouched(true);
                  change({ title: event.target.value });
                }}
              />
            </div>
            <Textarea
              id="menu-intro"
              label={t('intro')}
              optionalLabel={t('optional')}
              value={settings.intro}
              rows={2}
              maxLength={300}
              error={errors.intro}
              onChange={(event) => change({ intro: event.target.value })}
            />
            <Input
              id="menu-address"
              label={t('address')}
              optionalLabel={t('optional')}
              hint={t('addressHint')}
              value={settings.address}
              maxLength={160}
              autoComplete="street-address"
              error={errors.address}
              onChange={(event) => change({ address: event.target.value })}
            />
            <Textarea
              id="menu-opening"
              label={t('openingNote')}
              optionalLabel={t('optional')}
              hint={t('openingNoteHint')}
              value={settings.openingNote}
              rows={2}
              maxLength={300}
              error={errors.openingNote}
              onChange={(event) => change({ openingNote: event.target.value })}
            />
            <Textarea
              id="menu-note"
              label={t('note')}
              optionalLabel={t('optional')}
              hint={t('noteHint')}
              value={settings.note}
              rows={2}
              maxLength={300}
              error={errors.note}
              onChange={(event) => change({ note: event.target.value })}
            />
          </section>

          <section className={styles.card} aria-labelledby="menu-visibility">
            <h2 id="menu-visibility" className={styles.cardTitle}>
              {t('visibilityTitle')}
            </h2>
            <Checkbox
              id="menu-enabled"
              label={t('enabled')}
              hint={t('enabledHint')}
              checked={settings.enabled}
              onChange={(event) => change({ enabled: event.target.checked })}
            />
            <Checkbox
              id="menu-noindex"
              label={t('noindex')}
              hint={t('noindexHint')}
              checked={!settings.indexable}
              onChange={(event) => change({ indexable: !event.target.checked })}
            />
          </section>

          <section className={styles.content} aria-labelledby="menu-content">
            <h2 id="menu-content" className={styles.cardTitle}>
              {t('contentTitle')}
            </h2>
            <p className={styles.muted}>{t('contentLead')}</p>
            {settings.kind === 'MENU' ? <Alert tone="warning">{t('allergenWarning')}</Alert> : null}
            {contentErrors > 0 ? (
              <Alert tone="error">{t('contentErrors', { count: contentErrors })}</Alert>
            ) : null}
            <ol className={styles.categories}>
              {categories.map((category, index) => {
                const label = name(category.name, index + 1, 'categoryN');
                const atItemLimit = category.items.length >= limits.itemsPerCategory;
                return (
                  <li key={category.uid} className={styles.category}>
                    <div className={styles.categoryHead}>
                      <Input
                        id={`cat-${category.uid}`}
                        className={styles.grow}
                        label={t('categoryName')}
                        placeholder={t('categoryPlaceholder')}
                        value={category.name}
                        maxLength={60}
                        error={errors[`categories.${index}.name`]}
                        onChange={(event) => editCategory(index, { name: event.target.value })}
                      />
                      <div className={styles.rowActions}>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={index === 0}
                          aria-label={t('moveUp', { name: label })}
                          onClick={() => structure((list) => moveItem(list, index, index - 1))}
                        >
                          ↑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={index === categories.length - 1}
                          aria-label={t('moveDown', { name: label })}
                          onClick={() => structure((list) => moveItem(list, index, index + 1))}
                        >
                          ↓
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={categories.length <= 1}
                          aria-label={t('removeCategory', { name: label })}
                          onClick={() => structure((list) => list.filter((_, i) => i !== index))}
                        >
                          {t('remove')}
                        </Button>
                      </div>
                    </div>

                    <ol className={styles.items}>
                      {category.items.map((item, position) => {
                        const itemLabel = name(item.name, position + 1, 'itemN');
                        const base = `categories.${index}.items.${position}`;
                        return (
                          <li
                            key={item.uid}
                            className={styles.item}
                            data-hidden={item.hidden ? '' : undefined}
                          >
                            <div className={styles.itemFields}>
                              <Input
                                id={`item-${item.uid}-name`}
                                className={styles.grow}
                                label={t('itemName')}
                                value={item.name}
                                maxLength={80}
                                error={errors[`${base}.name`]}
                                onChange={(event) =>
                                  editItem(index, position, { name: event.target.value })
                                }
                              />
                              <Input
                                id={`item-${item.uid}-price`}
                                className={styles.price}
                                label={t('itemPrice')}
                                value={item.price ?? ''}
                                maxLength={20}
                                inputMode="decimal"
                                error={errors[`${base}.price`]}
                                onChange={(event) =>
                                  editItem(index, position, { price: event.target.value })
                                }
                              />
                            </div>
                            <Textarea
                              id={`item-${item.uid}-description`}
                              label={t('itemDescription')}
                              optionalLabel={t('optional')}
                              value={item.description ?? ''}
                              rows={2}
                              maxLength={200}
                              error={errors[`${base}.description`]}
                              onChange={(event) =>
                                editItem(index, position, { description: event.target.value })
                              }
                            />
                            {settings.kind === 'MENU' ? (
                              <details className={styles.allergens}>
                                <summary>
                                  {t('allergens', { count: item.allergens?.length ?? 0 })}
                                </summary>
                                <div className={styles.allergenList}>
                                  {MENU_ALLERGENS.map((allergen) => (
                                    <Checkbox
                                      key={allergen}
                                      id={`item-${item.uid}-${allergen}`}
                                      label={tm(`allergens.${allergen}`)}
                                      checked={item.allergens?.includes(allergen) ?? false}
                                      onChange={(event) =>
                                        toggleAllergen(
                                          index,
                                          position,
                                          allergen,
                                          event.target.checked,
                                        )
                                      }
                                    />
                                  ))}
                                </div>
                                {errors[`${base}.allergens`] ? (
                                  <p className={styles.fieldError}>{errors[`${base}.allergens`]}</p>
                                ) : null}
                              </details>
                            ) : null}
                            <div className={styles.itemFoot}>
                              <Checkbox
                                id={`item-${item.uid}-sold`}
                                label={t('itemSoldOut')}
                                checked={item.soldOut ?? false}
                                onChange={(event) =>
                                  editItem(index, position, { soldOut: event.target.checked })
                                }
                              />
                              <Checkbox
                                id={`item-${item.uid}-hidden`}
                                label={t('itemHidden')}
                                checked={item.hidden ?? false}
                                onChange={(event) =>
                                  editItem(index, position, { hidden: event.target.checked })
                                }
                              />
                              <div className={styles.rowActions}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={position === 0}
                                  aria-label={t('moveUp', { name: itemLabel })}
                                  onClick={() =>
                                    structure((list) =>
                                      list.map((c, i) =>
                                        i === index
                                          ? {
                                              ...c,
                                              items: moveItem(c.items, position, position - 1),
                                            }
                                          : c,
                                      ),
                                    )
                                  }
                                >
                                  ↑
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={position === category.items.length - 1}
                                  aria-label={t('moveDown', { name: itemLabel })}
                                  onClick={() =>
                                    structure((list) =>
                                      list.map((c, i) =>
                                        i === index
                                          ? {
                                              ...c,
                                              items: moveItem(c.items, position, position + 1),
                                            }
                                          : c,
                                      ),
                                    )
                                  }
                                >
                                  ↓
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={t('removeItem', { name: itemLabel })}
                                  onClick={() =>
                                    structure((list) =>
                                      list.map((c, i) =>
                                        i === index
                                          ? {
                                              ...c,
                                              items: c.items.filter((_, p) => p !== position),
                                            }
                                          : c,
                                      ),
                                    )
                                  }
                                >
                                  {t('remove')}
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={atItemLimit}
                        onClick={() =>
                          structure((list) =>
                            list.map((c, i) =>
                              i === index
                                ? { ...c, items: [...c.items, { uid: uid(), name: '' }] }
                                : c,
                            ),
                          )
                        }
                      >
                        {t('addItem')}
                        <span className="visually-hidden"> — {label}</span>
                      </Button>
                      {atItemLimit ? (
                        <p className={styles.muted}>
                          {t('limitItems', { count: limits.itemsPerCategory })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div>
              <Button
                variant="outline"
                disabled={atCategoryLimit}
                onClick={() =>
                  structure((list) => [
                    ...list,
                    { uid: uid(), name: '', items: [{ uid: uid(), name: '' }] },
                  ])
                }
              >
                {t('addCategory')}
              </Button>
              {atCategoryLimit ? (
                <p className={styles.muted}>{t('limitCategories', { count: limits.categories })}</p>
              ) : null}
            </div>
          </section>
        </div>

        <aside className={styles.preview} data-panel="preview" aria-labelledby="menu-preview">
          <h2 id="menu-preview" className={styles.cardTitle}>
            {t('previewTitle')}
          </h2>
          <p className={styles.muted}>{t('previewNote')}</p>
          <div className={styles.previewFrame}>
            <MenuPage
              menu={previewMenu}
              labels={labels}
              uiLocale={locale}
              badgeHref={badgeHref}
              preview
            />
          </div>
        </aside>
      </div>

      <div className={styles.saveBar}>
        <div className={styles.saveText} aria-live="polite">
          {shown ? (
            <Alert tone={shown.tone}>
              {shown.text}
              {notice === 'stale' ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => window.location.reload()}
                  >
                    {t('reload')}
                  </button>
                </>
              ) : null}
            </Alert>
          ) : dirty && !isNew ? (
            <p className={styles.muted}>{t('unsaved')}</p>
          ) : null}
        </div>
        <Button type="submit" disabled={pending || slugUnavailable}>
          {pending ? t('saving') : isNew ? t('create') : t('save')}
        </Button>
      </div>
    </form>
  );
}
