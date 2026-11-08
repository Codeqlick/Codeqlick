'use client';

import { useEffect, useRef } from 'react';
import styles from './app.module.css';

/**
 * Cloudflare Turnstile's widget (architecture 4.3): put inside a form, it adds the hidden field
 * `captcha` with the token the API checks. After each submit it asks for a new token, because a
 * token works once (a failed sign-in keeps the form on screen).
 */

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function turnstileApi(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

function loadTurnstile(): Promise<TurnstileApi> {
  const ready = turnstileApi();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () => {
      const api = turnstileApi();
      if (api) resolve(api);
      else reject(new Error('Turnstile did not load'));
    });
    script.addEventListener('error', () => {
      loading = null;
      reject(new Error('Turnstile did not load'));
    });
    document.head.append(script);
  });
  return loading;
}

export function Turnstile({ siteKey, locale }: { siteKey: string; locale: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const widget: {
      api?: TurnstileApi;
      id?: string;
      timer?: ReturnType<typeof setTimeout>;
      cancelled: boolean;
    } = { cancelled: false };
    const form = element.closest('form');
    // The form's data is read as the submit happens; the new token is asked for just after.
    const onSubmit = () => {
      clearTimeout(widget.timer);
      widget.timer = setTimeout(() => {
        if (widget.api && widget.id) widget.api.reset(widget.id);
      }, 500);
    };
    loadTurnstile()
      .then((api) => {
        if (widget.cancelled) return;
        widget.api = api;
        widget.id = api.render(element, {
          sitekey: siteKey,
          language: locale,
          theme: 'light',
          size: 'flexible',
          'response-field-name': 'captcha',
        });
      })
      .catch(() => {
        // Blocked or offline: the API answers that the check is missing, and the form says so.
      });
    form?.addEventListener('submit', onSubmit);
    return () => {
      widget.cancelled = true;
      clearTimeout(widget.timer);
      form?.removeEventListener('submit', onSubmit);
      if (widget.api && widget.id) widget.api.remove(widget.id);
    };
  }, [siteKey, locale]);

  return <div ref={container} className={styles.turnstile} />;
}
