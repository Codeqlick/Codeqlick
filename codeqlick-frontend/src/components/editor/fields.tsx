'use client';

import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { contrast, getAt, type Content, type Json } from './content';
import styles from './SiteEditor.module.css';

/** What every field of the editor works on: the content, by path. */
export type EditorContextValue = {
  content: Content;
  set: (path: string, value: Json | undefined) => void;
  errors: Record<string, string>;
  /** The preset whose photos the content may name. */
  preset: string;
  upload: (file: File) => Promise<string | null>;
};

export const EditorContext = createContext<EditorContextValue | null>(null);

function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('Editor fields need the EditorContext');
  return value;
}

/** The first issue of the API at `path` or under it, translated. */
function useError(path: string): string | undefined {
  const { errors } = useEditor();
  const t = useTranslations('SiteEditor.errors');
  const key = Object.keys(errors).find((key) => key === path || key.startsWith(`${path}.`));
  if (!key) return undefined;
  const message = errors[key]!;
  if (/>=1 character|expected string, received undefined|Required|expected array/i.test(message))
    return t('required');
  if (/Too big|<=/i.test(message)) return t('tooLong');
  if (/colour/i.test(message)) return t('color');
  if (/link|url|URL/.test(message)) return t('link');
  if (/email/i.test(message)) return t('email');
  if (/Too small|>=/i.test(message)) return t('tooFew');
  return t('invalid');
}

/** A photo's address for the editor: an upload, or one of the style's. */
export function photoUrl(file: string, preset: string): string {
  return file.startsWith('media/') ? `/${file}` : `/presets/${preset}/${file}`;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className={styles.hint}>{hint}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A text at `path`; an optional one left empty is removed from the content. */
export function TextField({
  path,
  label,
  hint,
  max,
  rows,
  required,
  placeholder,
}: {
  path: string;
  label: string;
  hint?: string;
  max: number;
  /** A textarea of that many rows. */
  rows?: number;
  required?: boolean;
  placeholder?: string;
}) {
  const { content, set } = useEditor();
  const id = useId();
  const error = useError(path);
  const value = getAt(content, path);
  const text = typeof value === 'string' ? value : '';
  const change = (next: string) => set(path, next === '' && !required ? undefined : next);
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {rows ? (
        <textarea
          id={id}
          className={styles.input}
          rows={rows}
          maxLength={max}
          value={text}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(event) => change(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className={styles.input}
          maxLength={max}
          value={text}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(event) => change(event.target.value)}
        />
      )}
    </Field>
  );
}

export function SelectField({
  path,
  label,
  hint,
  options,
  optional,
}: {
  path: string;
  label: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
  /** Adds an empty choice, which removes the value. */
  optional?: string;
}) {
  const { content, set } = useEditor();
  const id = useId();
  const value = getAt(content, path);
  return (
    <Field id={id} label={label} hint={hint} error={useError(path)}>
      <select
        id={id}
        className={styles.input}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => set(path, event.target.value || undefined)}
      >
        {optional !== undefined ? <option value="">{optional}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A colour of the theme, with the contrast against `against` when it matters for reading. */
export function ColorField({
  path,
  label,
  against,
}: {
  path: string;
  label: string;
  against?: { path: string; label: string };
}) {
  const { content, set } = useEditor();
  const t = useTranslations('SiteEditor');
  const id = useId();
  const value = getAt(content, path);
  const color = typeof value === 'string' ? value : '#000000';
  const other = against ? getAt(content, against.path) : undefined;
  const ratio = typeof other === 'string' ? contrast(color, other) : null;
  return (
    <Field id={id} label={label} error={useError(path)}>
      <div className={styles.color}>
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'}
          onChange={(event) => set(path, event.target.value.toUpperCase())}
        />
        <input
          id={id}
          className={`${styles.input} ${styles.mono}`}
          value={color}
          maxLength={7}
          onChange={(event) => set(path, event.target.value)}
        />
      </div>
      {against && ratio !== null && ratio < 4.5 ? (
        <p className={styles.warning}>
          {t('lowContrast', { other: against.label, ratio: ratio.toFixed(1) })}
        </p>
      ) : null}
    </Field>
  );
}

/** A photo at `path` (`{ file, alt }`): replaced by an upload, described for those who can't see it. */
export function ImageField({
  path,
  label,
  removable,
}: {
  path: string;
  label: string;
  /** Optional photos can be taken out. */
  removable?: boolean;
}) {
  const { content, set, preset, upload } = useEditor();
  const t = useTranslations('SiteEditor');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const image = getAt(content, path) as { file?: string; alt?: string } | undefined;
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    const name = await upload(file);
    setBusy(false);
    if (!name) {
      setProblem(t('photoFailed'));
      return;
    }
    set(path, { file: name, alt: image?.alt || t('photoAltDefault') });
  };
  return (
    <div className={styles.photoField}>
      <p className={styles.label}>{label}</p>
      <div className={styles.photoRow}>
        {image?.file ? (
          // oxlint-disable-next-line nextjs/no-img-element -- uploads come from the media route, a style's photos from public/presets
          <img src={photoUrl(image.file, preset)} alt="" className={styles.thumb} />
        ) : (
          <span className={styles.thumbEmpty}>{t('noPhoto')}</span>
        )}
        <div className={styles.photoActions}>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <button
            type="button"
            className={styles.small}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? t('uploading') : image?.file ? t('replacePhoto') : t('addPhoto')}
          </button>
          {removable && image?.file ? (
            <button type="button" className={styles.link} onClick={() => set(path, undefined)}>
              {t('removePhoto')}
            </button>
          ) : null}
        </div>
      </div>
      {problem ? (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      ) : null}
      {image?.file ? (
        <TextField
          path={`${path}.alt`}
          label={t('photoAlt')}
          hint={t('photoAltHint')}
          max={200}
          required
        />
      ) : null}
    </div>
  );
}

/**
 * A list at `path`: each item edited by `render(itemPath)`, added (`blank`), moved and removed;
 * the list goes when it is emptied unless `min` keeps some.
 */
export function ListField({
  path,
  label,
  addLabel,
  blank,
  render,
  max,
  min = 0,
}: {
  path: string;
  label: string;
  addLabel: string;
  blank: Json;
  render: (itemPath: string, index: number) => ReactNode;
  max: number;
  min?: number;
}) {
  const { content, set } = useEditor();
  const t = useTranslations('SiteEditor');
  const value = getAt(content, path);
  const items = Array.isArray(value) ? value : [];
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    set(path, next);
  };
  return (
    <fieldset className={styles.list}>
      <legend className={styles.label}>{label}</legend>
      {items.map((_, index) => (
        <div key={index} className={styles.item}>
          <div className={styles.itemBar}>
            <span>{t('item', { n: index + 1 })}</span>
            <span className={styles.itemActions}>
              <button
                type="button"
                className={styles.icon}
                aria-label={t('moveUp')}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.icon}
                aria-label={t('moveDown')}
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={styles.icon}
                aria-label={t('removeItem', { n: index + 1 })}
                disabled={items.length <= min}
                onClick={() => {
                  const next = items.filter((__, i) => i !== index);
                  set(path, next.length === 0 && min === 0 ? undefined : next);
                }}
              >
                ×
              </button>
            </span>
          </div>
          {render(`${path}.${index}`, index)}
        </div>
      ))}
      {items.length < max ? (
        <button type="button" className={styles.small} onClick={() => set(path, [...items, blank])}>
          + {addLabel}
        </button>
      ) : null}
    </fieldset>
  );
}

/** Shows or hides an optional part of the site: `blank` is what it starts with. */
export function Toggle({
  path,
  label,
  blank,
  children,
}: {
  path: string;
  label: string;
  blank: () => Json;
  children: ReactNode;
}) {
  const { content, set } = useEditor();
  const on = getAt(content, path) !== undefined;
  return (
    <div className={styles.stack}>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => set(path, event.target.checked ? blank() : undefined)}
        />
        {label}
      </label>
      {on ? children : null}
    </div>
  );
}

/** A button or link: its text and where it goes. */
export function LinkField({ path, label }: { path: string; label: string }) {
  const t = useTranslations('SiteEditor');
  return (
    <div className={styles.row}>
      <TextField path={`${path}.label`} label={label} max={60} required />
      <TextField
        path={`${path}.href`}
        label={t('linkHref')}
        hint={t('linkHrefHint')}
        max={500}
        required
      />
    </div>
  );
}
