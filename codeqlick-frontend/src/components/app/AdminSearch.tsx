'use client';

// The WAI-ARIA combobox pattern: a native select or datalist can't hold grouped, two-line options.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  ADMIN_SEARCH_DEBOUNCE_MS,
  ADMIN_SEARCH_MAX_LENGTH,
  adminSearchHref,
  adminSearchQuery,
  isApplePlatform,
  moveActiveIndex,
} from '@/lib/admin-search';
import type { AdminSearch as AdminSearchResult, AdminSearchKind } from '@/lib/api/types';
import styles from './AdminSearch.module.css';

export type AdminSearchLabels = {
  /** The button's text, and its name when only the icon shows (phones). */
  button: string;
  /** The shortcut shown next to the button: `Ctrl K`, or `⌘K` on Apple devices. */
  shortcut: string;
  shortcutApple: string;
  /** The dialog's (visually hidden) heading. */
  title: string;
  inputLabel: string;
  placeholder: string;
  close: string;
  /** The results list's name. */
  results: string;
  /** Below 2 characters. */
  hint: string;
  searching: string;
  /** With `{q}`. */
  empty: string;
  resultsOne: string;
  /** With `{count}`. */
  resultsMany: string;
  tooMany: string;
  failed: string;
  expired: string;
  /** Each group's heading: the admin menu's names. */
  groups: Record<AdminSearchKind, string>;
};

type Status = 'idle' | 'searching' | 'done' | 'tooMany' | 'failed' | 'expired';

type Option = {
  kind: AdminSearchKind;
  id: string;
  label: string;
  sublabel: string | null;
  /** Position among all the options, across groups. */
  index: number;
};

/** The platform never changes: nothing to subscribe to. */
const subscribeNever = () => () => {};

/** Opens the dialog with an empty field focused, remembering what had the focus. */
function openModal(
  dialog: HTMLDialogElement,
  input: HTMLInputElement | null,
  returnFocus: RefObject<HTMLElement | null>,
) {
  if (dialog.open) return;
  returnFocus.current =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.showModal();
  input?.focus();
}

function SearchIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16 L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The admin search (architecture 6.2, "Admin search"): a button for the admin bar and a modal
 * dialog that finds leads, users, projects, requests, proposals, posts and case studies. Ctrl+K or
 * Cmd+K toggles it anywhere in the admin panel. The field is an ARIA combobox over a grouped
 * listbox; searches go to the BFF route `/<locale>/admin/search`, never to the API.
 */
export function AdminSearch({ locale, labels }: { locale: string; labels: AdminSearchLabels }) {
  const router = useRouter();
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const controllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AdminSearchResult | null>(null);
  const [active, setActive] = useState(-1);
  // Read after mount: the server (and the first render) shows `Ctrl K`.
  const apple = useSyncExternalStore(
    subscribeNever,
    () => isApplePlatform(navigator.userAgent),
    () => false,
  );

  const titleId = `${baseId}-title`;
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  // The shortcut, and a click on the backdrop (the dialog itself, outside its panel) to close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const press = { onBackdrop: false };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'k') return;
      // Also while typing in another field: the shortcut types nothing, and the browser's own
      // Ctrl+K (its search bar) is kept from opening.
      event.preventDefault();
      if (dialog.open) dialog.close();
      else openModal(dialog, inputRef.current, returnFocusRef);
    };
    const onPointerDown = (event: PointerEvent) => {
      press.onBackdrop = event.target === dialog;
    };
    const onClick = (event: MouseEvent) => {
      // Only a click that started there too: selecting text and letting go outside keeps it open.
      if (event.target === dialog && press.onBackdrop) dialog.close();
      press.onBackdrop = false;
    };

    window.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('click', onClick);
    };
  }, []);

  // Keep the highlighted option in view while moving with the keyboard.
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${baseId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, baseId]);

  // Leaving the admin drops a search still waiting or in flight.
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    },
    [],
  );

  function cancelPending() {
    clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  function close() {
    dialogRef.current?.close();
  }

  /** The dialog closed (Escape, the shortcut, the backdrop, the button or a result). */
  function handleClose() {
    cancelPending();
    setQuery('');
    setStatus('idle');
    setResult(null);
    setActive(-1);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }

  async function search(q: string) {
    const controller = new AbortController();
    controllerRef.current = controller;
    let next: Status;
    let data: AdminSearchResult | null = null;
    try {
      const response = await fetch(`/${locale}/admin/search?${new URLSearchParams({ q })}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      // The proxy sends a session it couldn't refresh to the login page.
      if (response.redirected || response.status === 401) next = 'expired';
      else if (response.status === 429) next = 'tooMany';
      else if (!response.ok) next = 'failed';
      else {
        data = (await response.json()) as AdminSearchResult;
        next = 'done';
      }
    } catch {
      if (controller.signal.aborted) return;
      next = 'failed';
    }
    // A newer search took over, or the field no longer says this: drop the answer.
    if (controller.signal.aborted || adminSearchQuery(inputRef.current?.value) !== q) return;
    controllerRef.current = null;
    const first = data?.groups.some((group) => group.items.length > 0) ? 0 : -1;
    setStatus(next);
    setResult(data);
    setActive(first);
  }

  function handleChange(value: string) {
    setQuery(value);
    cancelPending();
    const q = adminSearchQuery(value);
    if (q === null) {
      setStatus('idle');
      setResult(null);
      setActive(-1);
      return;
    }
    setStatus('searching');
    timerRef.current = setTimeout(() => void search(q), ADMIN_SEARCH_DEBOUNCE_MS);
  }

  // Every option across the groups, numbered in order for the keyboard.
  let count = 0;
  const groups = (result?.groups ?? [])
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      kind: group.kind,
      options: group.items.map((item): Option => ({ ...item, kind: group.kind, index: count++ })),
    }));
  const options = groups.flatMap((group) => group.options);
  const expanded = options.length > 0;

  function openOption(option: Option) {
    close();
    router.push(adminSearchHref(option.kind, option.id));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!expanded) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => moveActiveIndex(current, delta, options.length));
    } else if (event.key === 'Enter') {
      const option = options[active];
      if (!option) return;
      event.preventDefault();
      openOption(option);
    }
  }

  const emptyText = labels.empty.replace('{q}', result?.q ?? query.trim());
  const errorText =
    status === 'tooMany'
      ? labels.tooMany
      : status === 'failed'
        ? labels.failed
        : status === 'expired'
          ? labels.expired
          : null;

  let message: string | null = null;
  if (status === 'idle') message = labels.hint;
  else if (status === 'searching') message = labels.searching;
  else if (status === 'done' && !expanded) message = emptyText;

  // What the polite live region says once a search ends.
  let announcement = '';
  if (status === 'done') {
    announcement = !expanded
      ? emptyText
      : options.length === 1
        ? labels.resultsOne
        : labels.resultsMany.replace('{count}', String(options.length));
  } else if (errorText) {
    announcement = errorText;
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={labels.button}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => {
          if (dialogRef.current) openModal(dialogRef.current, inputRef.current, returnFocusRef);
        }}
      >
        <SearchIcon />
        <span className={styles.triggerText}>{labels.button}</span>
        <kbd className={styles.kbd}>{apple ? labels.shortcutApple : labels.shortcut}</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        onClose={handleClose}
      >
        <div className={styles.panel}>
          <h2 id={titleId} className="visually-hidden">
            {labels.title}
          </h2>
          <div className={styles.field}>
            <SearchIcon />
            <label htmlFor={inputId} className="visually-hidden">
              {labels.inputLabel}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className={styles.input}
              type="text"
              role="combobox"
              aria-expanded={expanded}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={ADMIN_SEARCH_MAX_LENGTH}
              placeholder={labels.placeholder}
              value={query}
              onChange={(event) => handleChange(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button type="button" className={styles.close} onClick={close}>
              {labels.close}
            </button>
          </div>

          <p role="status" aria-live="polite" className="visually-hidden">
            {announcement}
          </p>
          {message ? <p className={styles.message}>{message}</p> : null}
          {errorText ? <p className={`${styles.message} ${styles.error}`}>{errorText}</p> : null}

          <div
            id={listboxId}
            role="listbox"
            aria-label={labels.results}
            aria-busy={status === 'searching'}
            className={styles.results}
            hidden={!expanded}
          >
            {groups.map((group) => {
              const headingId = `${baseId}-group-${group.kind}`;
              return (
                <div key={group.kind} role="group" aria-labelledby={headingId}>
                  <div id={headingId} role="presentation" className={styles.groupTitle}>
                    {labels.groups[group.kind]}
                  </div>
                  {group.options.map((option) => (
                    // The field drives the list (aria-activedescendant) from the keyboard; the
                    // mouse highlights on hover and opens on click, keeping the focus in the field.
                    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
                    <div
                      key={option.id}
                      id={optionId(option.index)}
                      role="option"
                      tabIndex={-1}
                      aria-selected={option.index === active}
                      className={`${styles.option} ${option.index === active ? styles.active : ''}`}
                      onMouseMove={() => setActive(option.index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openOption(option)}
                    >
                      <span className={styles.label}>{option.label}</span>
                      {option.sublabel ? (
                        <span className={styles.sublabel}>{option.sublabel}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </dialog>
    </>
  );
}
