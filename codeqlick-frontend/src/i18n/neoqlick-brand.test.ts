import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adultSafetySection } from '@/content/legal/adult-safety';
import { cruisingLegalDocument } from '@/content/legal/cruising';
import { neoqlickLegalDocument } from '@/content/legal/neoqlick';
import { swipeLegalDocument } from '@/content/legal/swipe';
import de from '../messages/de.json';
import en from '../messages/en.json';
import es from '../messages/es.json';
import fr from '../messages/fr.json';
import itMessages from '../messages/it.json';
import neoDe from '../messages/neoqlick/de.json';
import neoEn from '../messages/neoqlick/en.json';
import neoEs from '../messages/neoqlick/es.json';
import neoFr from '../messages/neoqlick/fr.json';
import neoIt from '../messages/neoqlick/it.json';
import neoPt from '../messages/neoqlick/pt.json';
import pt from '../messages/pt.json';
import { NEOQLICK_NAMESPACES, overlay, withFallback, type Messages } from './messages';
import { routing, type AppLocale } from './routing';

/** Decision 125: nothing on a Neoqlick host names Codeqlick. */
const CODEQLICK = /codeqlick/i;

const CATALOGUES: Record<AppLocale, [Messages, Messages]> = {
  en: [en as unknown as Messages, neoEn],
  es: [es as unknown as Messages, neoEs],
  fr: [fr as unknown as Messages, neoFr],
  de: [de as unknown as Messages, neoDe],
  it: [itMessages as unknown as Messages, neoIt],
  pt: [pt as unknown as Messages, neoPt],
};

/** What a Neoqlick host serves in a language: the catalogue with Neoqlick's wording over it. */
function neoqlickMessages(locale: AppLocale): Messages {
  const [own, over] = CATALOGUES[locale];
  const base =
    locale === 'en' || locale === 'es' ? own : withFallback(own, en as unknown as Messages);
  return overlay(base, over);
}

function strings(node: Messages | string, path: string): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  return Object.entries(node).flatMap(([key, value]) => strings(value, `${path}.${key}`));
}

describe('no Codeqlick on Neoqlick hosts (decision 125)', () => {
  it.each(routing.locales)('the messages Neoqlick renders, in %s', (locale) => {
    const messages = neoqlickMessages(locale);
    const found = NEOQLICK_NAMESPACES.flatMap((namespace) =>
      strings(messages[namespace] ?? '', namespace),
    ).filter(([, text]) => CODEQLICK.test(text));
    expect(found).toEqual([]);
  });

  it.each(routing.locales)('the legal texts, in %s', (locale) => {
    const owner = { name: 'Ana Pérez', taxId: 'X1234567Z', address: 'Calle Mayor 1, Madrid' };
    const documents = [
      ...(['legal', 'privacy', 'terms'] as const).map((page) =>
        neoqlickLegalDocument(page, owner, locale),
      ),
      cruisingLegalDocument('cruising-terms', owner, locale),
      cruisingLegalDocument('cruising-privacy', owner, locale),
      ...(locale === 'en' || locale === 'es'
        ? (['swipe-terms', 'swipe-privacy'] as const).map((page) =>
            swipeLegalDocument(page, owner, locale),
          )
        : []),
    ];
    for (const document of documents) {
      expect(`${document.title}\n${document.description}\n${document.markdown}`).not.toMatch(
        CODEQLICK,
      );
    }
    for (const kind of ['terms', 'privacy'] as const) {
      expect(adultSafetySection(kind, locale, 'hello@neoqlick.com')).not.toMatch(CODEQLICK);
    }
  });

  it('the static files of the apps and the Neoqlick pack', () => {
    const publics = ['cruising-sw.js', 'swipe-sw.js', 'videochat-sw.js', 'cruising-offline.html'];
    for (const file of publics) {
      expect(readFileSync(join(process.cwd(), 'public', file), 'utf8'), file).not.toMatch(
        CODEQLICK,
      );
    }
    const svg = join(process.cwd(), 'public', 'neoqlick', 'svg');
    for (const file of readdirSync(svg)) {
      expect(readFileSync(join(svg, file), 'utf8'), file).not.toMatch(CODEQLICK);
    }
  });
});

describe('Neoqlick’s wording', () => {
  it('only overrides keys that exist in the shared messages (a typo would add a dead key)', () => {
    const base = en as unknown as Messages;
    for (const [namespace, node] of Object.entries(neoEn)) {
      for (const [path] of strings(node, namespace)) {
        let at: Messages | string | undefined = base;
        for (const key of path.split('.')) at = typeof at === 'object' ? at[key] : undefined;
        expect(typeof at, path).toBe('string');
      }
    }
  });
});
