'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Chat translation in the browser (architecture 4.7): the built-in Translator and Language
 * Detector APIs (Chrome and Edge 138+ on desktop). Nothing leaves the device; browsers without
 * them don't show the switch.
 */

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface BrowserTranslator {
  translate(text: string): Promise<string>;
}
interface BrowserDetector {
  detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
}
interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserTranslator>;
}
interface DetectorApi {
  create(): Promise<BrowserDetector>;
}

function apis(): { translator: TranslatorApi; detector: DetectorApi } | null {
  if (typeof self === 'undefined') return null;
  const scope = self as unknown as { Translator?: TranslatorApi; LanguageDetector?: DetectorApi };
  if (!scope.Translator || !scope.LanguageDetector) return null;
  return { translator: scope.Translator, detector: scope.LanguageDetector };
}

/** Below this confidence the language isn't trusted and the message is left as it is. */
const MIN_CONFIDENCE = 0.6;
const KEY = 'cq-videochat-translate';
const EVENT = 'cq-videochat-translate';

function storedOn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}
function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENT, callback);
  };
}
function store(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Private mode: it just isn't remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

export interface ChatTranslation {
  /** The browser can translate. */
  supported: boolean;
  /** The person turned translation on (remembered on the device). */
  on: boolean;
  setOn(on: boolean): void;
  /** The text in the page's language, or null when it already is (or can't be translated). */
  translate(text: string): Promise<string | null>;
}

export function useChatTranslation(locale: string): ChatTranslation {
  const target = locale.split('-')[0] ?? 'en';
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => apis() !== null,
    () => false,
  );
  const on = useSyncExternalStore(subscribe, storedOn, () => false);
  const detector = useRef<Promise<BrowserDetector> | null>(null);
  const translators = useRef(new Map<string, Promise<BrowserTranslator | null>>());

  const prepare = useCallback(() => {
    const api = apis();
    if (!api) return;
    // Created on the person's click: a download of the browser's model needs one.
    detector.current ??= api.detector.create();
    detector.current.catch(() => {
      detector.current = null;
    });
  }, []);

  useEffect(() => {
    if (on) prepare();
  }, [on, prepare]);

  const setOn = useCallback(
    (value: boolean) => {
      if (value) prepare();
      store(value);
    },
    [prepare],
  );

  const translate = useCallback(
    async (text: string): Promise<string | null> => {
      const api = apis();
      if (!api || !detector.current) return null;
      try {
        const [best] = await (await detector.current).detect(text);
        const source = best?.detectedLanguage.split('-')[0];
        if (!best || !source || best.confidence < MIN_CONFIDENCE || source === target) return null;
        let translator = translators.current.get(source);
        if (!translator) {
          translator = api.translator
            .availability({ sourceLanguage: source, targetLanguage: target })
            .then((availability) =>
              availability === 'unavailable'
                ? null
                : api.translator.create({ sourceLanguage: source, targetLanguage: target }),
            )
            .catch(() => null);
          translators.current.set(source, translator);
        }
        const ready = await translator;
        if (!ready) {
          // Try again with a later message (the model may download meanwhile).
          translators.current.delete(source);
          return null;
        }
        const translated = await ready.translate(text);
        return translated.trim() && translated.trim() !== text.trim() ? translated : null;
      } catch {
        return null;
      }
    },
    [target],
  );

  return { supported, on, setOn, translate };
}
