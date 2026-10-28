'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  applyStyleAction,
  discardDraftAction,
  publishDraftAction,
  saveDraftAction,
  uploadEditorPhotoAction,
  type EditorResult,
} from '@/app/[locale]/portal/projects/[id]/site/editor/actions';
import type { AppLocale } from '@/i18n/routing';
import type { SiteEditorView } from '@/lib/api/types';
import {
  liveTexts,
  setAt,
  structureOf,
  themeVars,
  getAt,
  type Content,
  type Json,
} from './content';
import {
  ColorField,
  EditorContext,
  ImageField,
  LinkField,
  ListField,
  SelectField,
  TextField,
  Toggle,
} from './fields';
import styles from './SiteEditor.module.css';

const SAVE_AFTER_MS = 900;
/** The preview's "desktop" width, scaled down to fit. */
const DESKTOP_WIDTH = 1280;
const SECTION_KEYS = ['services', 'about', 'gallery', 'testimonials'] as const;
/** Where each part of the form is in the preview (the template's ids). */
const ANCHORS: Record<string, string> = {
  services: 'servicios',
  about: 'nosotros',
  gallery: 'galeria',
  testimonials: 'opiniones',
  banner: 'banner-title',
  contact: 'contacto',
};
const SCHEMA_TYPES = [
  'LocalBusiness',
  'HairSalon',
  'BeautySalon',
  'Restaurant',
  'CafeOrCoffeeShop',
  'Bakery',
  'Store',
  'Florist',
  'Physiotherapy',
  'MedicalClinic',
  'Dentist',
  'Attorney',
  'AccountingService',
  'ProfessionalService',
  'HomeAndConstructionBusiness',
  'Plumber',
  'Electrician',
  'AutoRepair',
  'SportsActivityLocation',
  'EducationalOrganization',
] as const;

type Status = 'saved' | 'pending' | 'saving' | 'building' | 'invalid' | 'failed';

/**
 * The website editor (architecture 8.2, decision 18): forms on one side, the draft's preview on
 * the other. Changes are saved as the draft shortly after typing; texts and the theme reach the
 * preview at once, anything else rebuilds it.
 */
export function SiteEditor({
  locale,
  projectId,
  initial,
  presetNames,
  liveUrl,
}: {
  locale: AppLocale;
  projectId: string;
  initial: SiteEditorView;
  /** Each style's name and kind ("Alba Estudio — Peluquería"). */
  presetNames: Record<string, string>;
  liveUrl: string;
}) {
  const t = useTranslations('SiteEditor');
  const [view, setView] = useState(initial);
  const [content, setContent] = useState(initial.content as Content);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('saved');
  const [frame, setFrame] = useState(0);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [published, setPublished] = useState(false);

  const latest = useRef(content);
  const preset = useRef(initial.preset);
  const [presetKey, setPresetKey] = useState(initial.preset);
  const built = useRef<string | null>(
    initial.draft?.previewStatus === 'READY' ? structureOf(initial.content as Content) : null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // The desktop preview is the site at DESKTOP_WIDTH, scaled to the space there is.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / DESKTOP_WIDTH));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [view.draft?.previewStatus]);

  /** The live texts and theme to the preview. */
  const push = useCallback((next: Content) => {
    iframe.current?.contentWindow?.postMessage(
      { type: 'cq-edit', texts: liveTexts(next), vars: themeVars(next.theme) },
      '*',
    );
  }, []);

  const apply = useCallback((result: EditorResult, rebuilt: string | null) => {
    if (!result.ok) {
      setErrors(result.errors);
      setStatus(result.message === 'invalid' ? 'invalid' : 'failed');
      return false;
    }
    setErrors({});
    setView(result.view);
    if (rebuilt !== null) {
      if (result.view.draft?.previewStatus === 'READY') {
        built.current = rebuilt;
        setFrame((n) => n + 1);
      } else {
        built.current = null;
      }
    }
    setStatus(result.view.draft?.previewStatus === 'FAILED' ? 'failed' : 'saved');
    return true;
  }, []);

  const save = useCallback(
    async function run(): Promise<void> {
      if (inFlight.current) {
        again.current = true;
        return;
      }
      inFlight.current = true;
      const snapshot = latest.current;
      const structure = structureOf(snapshot);
      const rebuild = structure !== built.current;
      setStatus(rebuild ? 'building' : 'saving');
      const result = await saveDraftAction(locale, projectId, {
        content: snapshot,
        preset: preset.current,
        rebuild,
      });
      inFlight.current = false;
      apply(result, rebuild ? structure : null);
      if (again.current) {
        again.current = false;
        void run();
      }
    },
    [apply, locale, projectId],
  );

  const set = useCallback(
    (path: string, value: Json | undefined) => {
      let next = setAt(
        latest.current,
        path,
        path === 'contact.whatsapp' && typeof value === 'string'
          ? value.replace(/\D/g, '') || undefined
          : value,
      );
      // Hours written by hand no longer match the machine-readable ones.
      if (path.startsWith('hours')) next = setAt(next, 'openingHoursSpec', undefined);
      latest.current = next;
      setContent(next);
      setPublished(false);
      push(next);
      setStatus('pending');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_AFTER_MS);
    },
    [push, save],
  );

  // The preview tells when it is ready: it then gets what changed while it was being built.
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === 'cq-ready') push(latest.current);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [push]);

  // A draft without a preview (or the first visit) builds one.
  useEffect(() => {
    if (initial.draft?.previewStatus !== 'READY') void save();
  }, [initial.draft?.previewStatus, save]);

  // Leaving with changes not saved yet asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status === 'pending' || status === 'saving' || status === 'building')
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const upload = useCallback(
    async (file: File) => {
      const body = new FormData();
      body.append('photo', file);
      const result = await uploadEditorPhotoAction(locale, projectId, body);
      return 'file' in result ? result.file : null;
    },
    [locale, projectId],
  );

  const scrollPreview = (part: string) => {
    const anchor = ANCHORS[part];
    if (anchor)
      iframe.current?.contentWindow?.postMessage({ type: 'cq-edit', scrollTo: anchor }, '*');
  };

  const chooseStyle = async (key: string) => {
    if (key === presetKey || !window.confirm(t('styleConfirm', { name: presetNames[key] ?? key })))
      return;
    if (timer.current) clearTimeout(timer.current);
    setStatus('building');
    const result = await applyStyleAction(locale, projectId, key);
    if (result.ok) {
      preset.current = result.view.preset;
      setPresetKey(result.view.preset);
      latest.current = result.view.content as Content;
      setContent(latest.current);
    }
    apply(result, result.ok ? structureOf(result.view.content as Content) : null);
  };

  const publish = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (status === 'pending') await save();
    setStatus('saving');
    const result = await publishDraftAction(locale, projectId);
    if (apply(result, null)) {
      setPublished(true);
      built.current = null;
    }
  };

  const discard = async () => {
    if (!window.confirm(t('discardConfirm'))) return;
    if (timer.current) clearTimeout(timer.current);
    if (await discardDraftAction(locale, projectId)) window.location.reload();
  };

  const context = useMemo(
    () => ({ content, set, errors, preset: presetKey, upload }),
    [content, set, errors, presetKey, upload],
  );
  const busy = status === 'pending' || status === 'saving' || status === 'building';
  // Something to publish: the draft differs from what is online.
  const changed =
    view.draft !== null &&
    (presetKey !== view.published.preset ||
      JSON.stringify(content) !== JSON.stringify(view.published.content));
  const sectionsOrder = useMemo(() => {
    const order = Array.isArray(content.sections) ? (content.sections as string[]) : [];
    return [...new Set([...order, ...SECTION_KEYS])];
  }, [content.sections]);
  const fonts = (['fraunces', 'playfair', 'outfit', 'inter'] as const).map((value) => ({
    value,
    label: t(`fonts.${value}`),
  }));

  return (
    <EditorContext.Provider value={context}>
      <div className={styles.toolbar}>
        <output className={styles.status} aria-live="polite">
          {published ? t('status.published') : t(`status.${status}`)}
        </output>
        <div className={styles.toolbarActions}>
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'edit'}
              onClick={() => setTab('edit')}
            >
              {t('tabEdit')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'preview'}
              onClick={() => setTab('preview')}
            >
              {t('tabPreview')}
            </button>
          </div>
          {changed ? (
            <button
              type="button"
              className={styles.link}
              onClick={() => void discard()}
              disabled={busy}
            >
              {t('discard')}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            onClick={() => void publish()}
            disabled={!changed || busy || status === 'invalid'}
          >
            {t('publish')}
          </button>
        </div>
      </div>
      {status === 'invalid' ? <p className={styles.banner}>{t('invalidBody')}</p> : null}
      {view.draft?.previewStatus === 'FAILED' ? (
        <p className={styles.banner}>{t('buildFailed')}</p>
      ) : null}
      {published ? (
        <p className={styles.bannerOk}>
          {t('publishedBody')}{' '}
          <a href={liveUrl} target="_blank" rel="noopener noreferrer">
            {liveUrl}
          </a>
        </p>
      ) : null}

      <div className={styles.layout} data-tab={tab}>
        <div className={styles.forms}>
          <details className={styles.part} open>
            <summary>{t('parts.design')}</summary>
            <div className={styles.stack}>
              <div>
                <p className={styles.label}>{t('style')}</p>
                <p className={styles.hint}>{t('styleHint')}</p>
                <ul className={styles.styles}>
                  {view.presets.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={styles.styleButton}
                        aria-pressed={item.key === presetKey}
                        disabled={busy}
                        onClick={() => void chooseStyle(item.key)}
                      >
                        <span className={styles.swatches} aria-hidden="true">
                          <span style={{ background: item.theme.primary }} />
                          <span style={{ background: item.theme.background }} />
                          <span style={{ background: item.theme.text }} />
                        </span>
                        {presetNames[item.key] ?? item.key}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.row}>
                <ColorField path="theme.primary" label={t('colors.primary')} />
                <ColorField
                  path="theme.primaryText"
                  label={t('colors.primaryText')}
                  against={{ path: 'theme.primary', label: t('colors.primary') }}
                />
              </div>
              <div className={styles.row}>
                <ColorField path="theme.background" label={t('colors.background')} />
                <ColorField path="theme.surface" label={t('colors.surface')} />
              </div>
              <div className={styles.row}>
                <ColorField
                  path="theme.text"
                  label={t('colors.text')}
                  against={{ path: 'theme.background', label: t('colors.background') }}
                />
                <ColorField
                  path="theme.muted"
                  label={t('colors.muted')}
                  against={{ path: 'theme.surface', label: t('colors.surface') }}
                />
              </div>
              <div className={styles.row}>
                <SelectField path="theme.headingFont" label={t('headingFont')} options={fonts} />
                <SelectField
                  path="theme.bodyFont"
                  label={t('bodyFont')}
                  options={fonts.filter(
                    (font) => font.value === 'inter' || font.value === 'outfit',
                  )}
                />
                <SelectField
                  path="theme.corners"
                  label={t('corners')}
                  options={(['square', 'soft', 'round'] as const).map((value) => ({
                    value,
                    label: t(`cornerNames.${value}`),
                  }))}
                />
              </div>
            </div>
          </details>

          <details className={styles.part}>
            <summary>{t('parts.business')}</summary>
            <div className={styles.stack}>
              <TextField path="business.name" label={t('businessName')} max={80} required />
              <TextField
                path="business.tagline"
                label={t('tagline')}
                hint={t('taglineHint')}
                max={80}
              />
              <TextField
                path="business.description"
                label={t('description')}
                hint={t('descriptionHint')}
                max={300}
                rows={3}
                required
              />
              <div className={styles.row}>
                <SelectField
                  path="business.schemaType"
                  label={t('schemaType')}
                  hint={t('schemaTypeHint')}
                  options={[
                    ...new Set([
                      ...SCHEMA_TYPES,
                      String(getAt(content, 'business.schemaType') ?? 'LocalBusiness'),
                    ]),
                  ].map((value) => ({
                    value,
                    label: t.has(`schemaTypes.${value}` as never)
                      ? t(`schemaTypes.${value}` as never)
                      : value,
                  }))}
                />
                <SelectField
                  path="business.priceRange"
                  label={t('priceRange')}
                  optional={t('none')}
                  options={['€', '€€', '€€€', '€€€€'].map((value) => ({ value, label: value }))}
                />
              </div>
            </div>
          </details>

          <details className={styles.part}>
            <summary>{t('parts.hero')}</summary>
            <div className={styles.stack}>
              <TextField
                path="hero.eyebrow"
                label={t('eyebrow')}
                hint={t('eyebrowHint')}
                max={80}
              />
              <TextField path="hero.title" label={t('headline')} max={120} required />
              <TextField path="hero.text" label={t('heroText')} max={400} rows={3} required />
              <ImageField path="hero.image" label={t('heroImage')} />
              <LinkField path="hero.primary" label={t('primaryButton')} />
              <Toggle
                path="hero.secondary"
                label={t('secondaryButton')}
                blank={() => ({ label: t('defaults.secondary'), href: '#servicios' })}
              >
                <LinkField path="hero.secondary" label={t('secondaryLabel')} />
              </Toggle>
              <ListField
                path="hero.facts"
                label={t('facts')}
                addLabel={t('addFact')}
                blank={{ value: '', label: '' }}
                max={3}
                render={(item) => (
                  <div className={styles.row}>
                    <TextField
                      path={`${item}.value`}
                      label={t('factValue')}
                      placeholder="15 años"
                      max={20}
                      required
                    />
                    <TextField
                      path={`${item}.label`}
                      label={t('factLabel')}
                      placeholder="en el barrio"
                      max={40}
                      required
                    />
                  </div>
                )}
              />
            </div>
          </details>

          <details className={styles.part}>
            <summary>{t('parts.sections')}</summary>
            <div className={styles.stack}>
              <p className={styles.hint}>{t('sectionsHint')}</p>
              <ol className={styles.order}>
                {sectionsOrder.map((key, index) => (
                  <li key={key}>
                    <span>
                      {t(`sectionNames.${key}` as never)}
                      {content[key] === undefined ? <em> · {t('hidden')}</em> : null}
                    </span>
                    <span className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.icon}
                        aria-label={t('moveUp')}
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...sectionsOrder];
                          [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                          set('sections', next);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.icon}
                        aria-label={t('moveDown')}
                        disabled={index === sectionsOrder.length - 1}
                        onClick={() => {
                          const next = [...sectionsOrder];
                          [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                          set('sections', next);
                        }}
                      >
                        ↓
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
              <div className={styles.row}>
                {SECTION_KEYS.map((key) => (
                  <TextField
                    key={key}
                    path={`navLabels.${key}`}
                    label={t('navLabel', { section: t(`sectionNames.${key}`) })}
                    placeholder={t(`sectionNames.${key}`)}
                    max={30}
                  />
                ))}
              </div>
            </div>
          </details>

          <details
            className={styles.part}
            onToggle={(event) => event.currentTarget.open && scrollPreview('services')}
          >
            <summary>{t('sectionNames.services')}</summary>
            <Toggle
              path="services"
              label={t('show', { section: t('sectionNames.services') })}
              blank={() => ({ title: t('sectionNames.services'), items: [{ name: '' }] })}
            >
              <TextField path="services.title" label={t('sectionTitle')} max={80} required />
              <TextField path="services.intro" label={t('intro')} max={300} rows={2} />
              <ListField
                path="services.items"
                label={t('services')}
                addLabel={t('addService')}
                blank={{ name: '' }}
                min={1}
                max={24}
                render={(item) => (
                  <>
                    <div className={styles.row}>
                      <TextField path={`${item}.name`} label={t('serviceName')} max={80} required />
                      <TextField
                        path={`${item}.price`}
                        label={t('price')}
                        placeholder="25 €"
                        max={30}
                      />
                    </div>
                    <TextField
                      path={`${item}.description`}
                      label={t('serviceDescription')}
                      max={200}
                      rows={2}
                    />
                  </>
                )}
              />
              <TextField path="services.note" label={t('note')} max={300} />
            </Toggle>
          </details>

          <details
            className={styles.part}
            onToggle={(event) => event.currentTarget.open && scrollPreview('about')}
          >
            <summary>{t('sectionNames.about')}</summary>
            <Toggle
              path="about"
              label={t('show', { section: t('sectionNames.about') })}
              blank={() => ({ title: t('sectionNames.about'), paragraphs: [''] })}
            >
              <TextField path="about.title" label={t('sectionTitle')} max={120} required />
              <ListField
                path="about.paragraphs"
                label={t('paragraphs')}
                addLabel={t('addParagraph')}
                blank=""
                min={1}
                max={6}
                render={(item) => (
                  <TextField path={item} label={t('paragraph')} max={1200} rows={4} required />
                )}
              />
              <ImageField path="about.image" label={t('aboutImage')} removable />
              <ListField
                path="about.highlights"
                label={t('highlights')}
                addLabel={t('addHighlight')}
                blank=""
                max={6}
                render={(item) => (
                  <TextField path={item} label={t('highlight')} max={120} required />
                )}
              />
            </Toggle>
          </details>

          <details
            className={styles.part}
            onToggle={(event) => event.currentTarget.open && scrollPreview('gallery')}
          >
            <summary>{t('sectionNames.gallery')}</summary>
            <Toggle
              path="gallery"
              label={t('show', { section: t('sectionNames.gallery') })}
              blank={() => ({
                title: t('sectionNames.gallery'),
                images: [getAt(latest.current, 'hero.image') ?? { file: '', alt: '' }],
              })}
            >
              <TextField path="gallery.title" label={t('sectionTitle')} max={80} required />
              <TextField path="gallery.intro" label={t('intro')} max={300} rows={2} />
              <Gallery />
            </Toggle>
          </details>

          <details
            className={styles.part}
            onToggle={(event) => event.currentTarget.open && scrollPreview('testimonials')}
          >
            <summary>{t('sectionNames.testimonials')}</summary>
            <Toggle
              path="testimonials"
              label={t('show', { section: t('sectionNames.testimonials') })}
              blank={() => ({
                title: t('sectionNames.testimonials'),
                items: [{ quote: '', author: '' }],
              })}
            >
              <TextField path="testimonials.title" label={t('sectionTitle')} max={80} required />
              <ListField
                path="testimonials.items"
                label={t('reviews')}
                addLabel={t('addReview')}
                blank={{ quote: '', author: '' }}
                min={1}
                max={9}
                render={(item) => (
                  <>
                    <TextField
                      path={`${item}.quote`}
                      label={t('quote')}
                      hint={t('quoteHint')}
                      max={600}
                      rows={3}
                      required
                    />
                    <div className={styles.row}>
                      <TextField path={`${item}.author`} label={t('author')} max={80} required />
                      <TextField path={`${item}.detail`} label={t('detail')} max={80} />
                    </div>
                  </>
                )}
              />
            </Toggle>
            <TextField
              path="contact.reviewUrl"
              label={t('reviewUrl')}
              hint={t('reviewUrlHint')}
              placeholder="https://g.page/r/…/review"
              max={500}
            />
          </details>

          <details
            className={styles.part}
            onToggle={(event) => event.currentTarget.open && scrollPreview('banner')}
          >
            <summary>{t('parts.banner')}</summary>
            <Toggle
              path="banner"
              label={t('showBanner')}
              blank={() => ({
                title: '',
                link: { label: t('defaults.bannerLink'), href: '#contacto' },
              })}
            >
              <TextField path="banner.title" label={t('bannerTitle')} max={120} required />
              <TextField path="banner.text" label={t('bannerText')} max={300} rows={2} />
              <LinkField path="banner.link" label={t('bannerLink')} />
            </Toggle>
          </details>

          <details
            className={styles.part}
            onToggle={(event) => event.currentTarget.open && scrollPreview('contact')}
          >
            <summary>{t('parts.contact')}</summary>
            <div className={styles.stack}>
              <TextField path="contactSection.title" label={t('contactTitle')} max={80} required />
              <TextField path="contactSection.intro" label={t('intro')} max={300} rows={2} />
              <div className={styles.row}>
                <TextField path="contact.phone" label={t('phone')} max={30} />
                <TextField
                  path="contact.whatsapp"
                  label={t('whatsapp')}
                  hint={t('whatsappHint')}
                  max={15}
                />
                <TextField path="contact.email" label={t('email')} max={254} />
              </div>
              <Toggle
                path="contact.address"
                label={t('showAddress')}
                blank={() => ({ street: '', city: '', region: '' })}
              >
                <div className={styles.row}>
                  <TextField path="contact.address.street" label={t('street')} max={120} required />
                  <TextField path="contact.address.postalCode" label={t('postalCode')} max={10} />
                </div>
                <div className={styles.row}>
                  <TextField path="contact.address.city" label={t('city')} max={80} required />
                  <TextField path="contact.address.region" label={t('region')} max={80} required />
                </div>
              </Toggle>
              <TextField
                path="contact.mapsUrl"
                label={t('mapsUrl')}
                hint={t('mapsUrlHint')}
                max={500}
              />
              <ListField
                path="hours"
                label={t('hours')}
                addLabel={t('addHours')}
                blank={{ days: '', hours: '' }}
                max={10}
                render={(item) => (
                  <div className={styles.row}>
                    <TextField
                      path={`${item}.days`}
                      label={t('days')}
                      placeholder={t('daysPlaceholder')}
                      max={60}
                      required
                    />
                    <TextField
                      path={`${item}.hours`}
                      label={t('hoursRow')}
                      placeholder="9:00–20:00"
                      max={60}
                      required
                    />
                  </div>
                )}
              />
            </div>
          </details>

          <details className={styles.part}>
            <summary>{t('parts.social')}</summary>
            <div className={styles.stack}>
              {(['instagram', 'facebook', 'tiktok', 'x'] as const).map((network) => (
                <TextField
                  key={network}
                  path={`social.${network}`}
                  label={t(`networks.${network}`)}
                  placeholder={`https://${network === 'x' ? 'x' : network}.com/…`}
                  max={500}
                />
              ))}
            </div>
          </details>

          <details className={styles.part}>
            <summary>{t('parts.legal')}</summary>
            <div className={styles.stack}>
              <p className={styles.hint}>{t('legalHint')}</p>
              <TextField path="legal.owner" label={t('legalOwner')} max={160} required />
              <div className={styles.row}>
                <TextField path="legal.taxId" label={t('taxId')} max={20} required />
                <TextField path="legal.email" label={t('legalEmail')} max={254} required />
              </div>
              <TextField path="legal.address" label={t('legalAddress')} max={200} required />
              <TextField
                path="legal.registry"
                label={t('registry')}
                hint={t('registryHint')}
                max={300}
              />
              <TextField
                path="footerNote"
                label={t('footerNote')}
                hint={t('footerNoteHint')}
                max={300}
              />
            </div>
          </details>
        </div>

        <div className={styles.preview}>
          <div className={styles.previewBar}>
            <span>{t('previewTitle')}</span>
            <span className={styles.tabs}>
              <button
                type="button"
                aria-pressed={width === 'desktop'}
                onClick={() => setWidth('desktop')}
              >
                {t('desktop')}
              </button>
              <button
                type="button"
                aria-pressed={width === 'phone'}
                onClick={() => setWidth('phone')}
              >
                {t('phoneView')}
              </button>
            </span>
          </div>
          {view.draft?.previewStatus === 'READY' ? (
            <div ref={box} className={styles.frameBox} data-width={width}>
              <iframe
                key={frame}
                ref={iframe}
                src={`${view.draft.previewUrl}?v=${frame}`}
                title={t('previewTitle')}
                sandbox="allow-scripts"
                className={styles.frame}
                style={
                  width === 'desktop' && scale < 1
                    ? {
                        width: `${DESKTOP_WIDTH}px`,
                        height: `${100 / scale}%`,
                        transform: `scale(${scale})`,
                      }
                    : undefined
                }
                onLoad={() => push(latest.current)}
              />
            </div>
          ) : (
            <div className={styles.frameEmpty}>
              {status === 'building' ? t('status.building') : t('previewMissing')}
            </div>
          )}
        </div>
      </div>
    </EditorContext.Provider>
  );
}

/** The gallery's photos: each described, removable, and new ones uploaded (1 to 12). */
function Gallery() {
  const t = useTranslations('SiteEditor');
  return (
    <ListField
      path="gallery.images"
      label={t('photos')}
      addLabel={t('addPhoto')}
      blank={{ file: '', alt: '' }}
      min={1}
      max={12}
      render={(item) => <ImageField path={item} label={t('photo')} />}
    />
  );
}
