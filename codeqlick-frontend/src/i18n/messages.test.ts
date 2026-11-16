import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';
import de from '../messages/de.json';
import en from '../messages/en.json';
import es from '../messages/es.json';
import fr from '../messages/fr.json';
import itMessages from '../messages/it.json';
import pt from '../messages/pt.json';
import { CRUISING_NAMESPACES, withFallback, type Messages } from './messages';

const EN = en as unknown as Messages;

const TRANSLATIONS: Record<string, Messages> = { fr, de, it: itMessages, pt };

/** The part of a catalogue a namespace path (`Cruising`, `Videochat.push`) names. */
function at(messages: Messages, path: string): Messages | string | undefined {
  let node: Messages | string | undefined = messages;
  for (const key of path.split('.')) node = typeof node === 'object' ? node[key] : undefined;
  return node;
}

/** Every leaf key of a subtree, dotted. */
function keys(node: Messages | string | undefined, prefix = ''): string[] {
  if (typeof node !== 'object') return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keys(value, prefix ? `${prefix}.${key}` : key),
  );
}

function leaves(node: Messages | string | undefined, prefix = ''): [string, string][] {
  if (node === undefined) return [];
  if (typeof node === 'string') return [[prefix, node]];
  return Object.entries(node).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  );
}

/** The arguments and tags of an ICU message, to compare a translation with its source. */
function argumentsOf(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: ReturnType<typeof parse>) => {
    for (const element of elements) {
      if ('value' in element && element.type !== TYPE.literal) {
        found.add(`${element.type}:${String(element.value)}`);
      }
      if ('children' in element) walk(element.children);
      if ('options' in element) {
        for (const option of Object.values(element.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return [...found].toSorted();
}

describe("Cruising's languages (decision 103)", () => {
  it.each(Object.keys(TRANSLATIONS))(
    '%s has exactly the keys of en.json it translates',
    (locale) => {
      const messages = TRANSLATIONS[locale]!;
      for (const path of CRUISING_NAMESPACES) {
        expect(keys(at(messages, path)), `${locale} ${path}`).toEqual(keys(at(EN, path)));
      }
      // Nothing else: the rest falls back to English.
      const translated = new Set(CRUISING_NAMESPACES.map((path) => path.split('.')[0]));
      expect(Object.keys(messages).filter((key) => !translated.has(key))).toEqual([]);
    },
  );

  it.each(Object.keys(TRANSLATIONS))(
    '%s parses as ICU, with the placeholders and tags of English',
    (locale) => {
      for (const path of CRUISING_NAMESPACES) {
        const source = new Map(leaves(at(EN, path), path));
        for (const [key, message] of leaves(at(TRANSLATIONS[locale]!, path), path)) {
          expect(() => parse(message), `${locale} ${key}`).not.toThrow();
          expect(argumentsOf(message), `${locale} ${key}`).toEqual(argumentsOf(source.get(key)!));
          expect(message.trim(), `${locale} ${key}`).not.toBe('');
        }
      }
    },
  );

  it('keeps English and Spanish complete', () => {
    expect(keys(es as unknown as Messages)).toEqual(keys(EN));
  });

  it('fills what a language lacks from English, deep', () => {
    const merged = withFallback(fr, EN);
    expect(keys(merged)).toEqual(keys(EN));
    expect(at(merged, 'Cruising.me.title')).toBe(at(fr, 'Cruising.me.title'));
    expect(at(merged, 'Videochat.push.title')).toBe(at(fr, 'Videochat.push.title'));
    // Not translated: the video chat's other texts and the admin are English.
    expect(at(merged, 'Videochat')).toMatchObject({ push: at(fr, 'Videochat.push') });
    expect(at(merged, 'Admin')).toEqual(at(EN, 'Admin'));
    expect(withFallback({ a: { b: 'B' } }, { a: { b: 'b', c: 'c' }, d: 'd' })).toEqual({
      a: { b: 'B', c: 'c' },
      d: 'd',
    });
  });
});
