import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  ALLERGENS,
  CONTENT_MAX_BYTES,
  type MenuAllergen,
  type MenuPlanLimits,
} from './menu-limits.js';
import { textProblem } from './menu-text.js';

export interface MenuItem {
  key: string;
  name: string;
  description?: string;
  price?: string;
  allergens?: MenuAllergen[];
  hidden?: boolean;
  soldOut?: boolean;
}

export interface MenuCategory {
  key: string;
  name: string;
  items: MenuItem[];
}

export interface MenuContent {
  categories: MenuCategory[];
}

export type MenuKindValue = 'MENU' | 'CATALOGUE';
export type MenuLanguageValue = 'EN' | 'ES';

export interface ContentIssue {
  path: string;
  message: string;
}

export type ContentResult =
  { ok: true; content: MenuContent } | { ok: false; errors: ContentIssue[] };

const KEY_PATTERN = /^[a-z0-9]{8}$/;
const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 8 random characters from `a-z0-9`. */
export function newKey(): string {
  const bytes = randomBytes(8);
  let key = '';
  for (const byte of bytes) key += KEY_ALPHABET[byte % KEY_ALPHABET.length];
  return key;
}

/** A plain text of `min`..`max` characters: trimmed, no control characters, no links. */
export function plainText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .superRefine((text, ctx) => {
      const problem = textProblem(text);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    });
}

const keySchema = z.string().regex(KEY_PATTERN, '8 lowercase letters or digits').optional();

function contentSchema(kind: MenuKindValue, limits: MenuPlanLimits) {
  const item = z
    .object({
      key: keySchema,
      name: plainText(1, 80),
      description: plainText(0, 200).optional(),
      price: plainText(0, 20).optional(),
      allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).optional(),
      hidden: z.boolean().optional(),
      soldOut: z.boolean().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (kind === 'CATALOGUE' && value.allergens && value.allergens.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['allergens'],
          message: 'A catalogue has no allergens',
        });
      }
    });
  const category = z
    .object({
      key: keySchema,
      name: plainText(1, 60),
      items: z.array(item).max(limits.itemsPerCategory),
    })
    .strict();
  return z.object({ categories: z.array(category).min(1).max(limits.categories) }).strict();
}

/** Allergens without repeats, in the order the page shows them. */
export function normalizeAllergens(allergens: readonly MenuAllergen[]): MenuAllergen[] {
  const set = new Set(allergens);
  return ALLERGENS.filter((allergen) => set.has(allergen));
}

/**
 * Validates a menu's whole content: 1-20 categories of 0-60 items, plain texts, allergens from the
 * EU's 14 (a catalogue has none), unique keys (missing ones are generated) and at most 200 KB.
 * Returns the content normalised (empty optional fields and false flags left out).
 */
export function parseContent(
  input: unknown,
  options: { kind: MenuKindValue; limits: MenuPlanLimits },
): ContentResult {
  const parsed = contentSchema(options.kind, options.limits).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: ['content', ...issue.path].join('.'),
        message: issue.message,
      })),
    };
  }
  const errors: ContentIssue[] = [];
  const used = new Set<string>();
  // Keys the client sent are claimed first, so a generated one can never collide with them.
  for (const category of parsed.data.categories) {
    if (category.key) used.add(category.key);
    for (const item of category.items) if (item.key) used.add(item.key);
  }
  const seen = new Set<string>();
  const claim = (key: string | undefined, path: string): string => {
    if (key !== undefined) {
      if (seen.has(key)) errors.push({ path, message: 'Each key must be unique in the menu' });
      seen.add(key);
      return key;
    }
    let fresh = newKey();
    while (used.has(fresh)) fresh = newKey();
    used.add(fresh);
    return fresh;
  };
  const content: MenuContent = {
    categories: parsed.data.categories.map((category, c) => ({
      key: claim(category.key, `content.categories.${c}.key`),
      name: category.name,
      items: category.items.map((item, i) => {
        const out: MenuItem = {
          key: claim(item.key, `content.categories.${c}.items.${i}.key`),
          name: item.name,
        };
        if (item.description) out.description = item.description;
        if (item.price) out.price = item.price;
        const allergens = normalizeAllergens(item.allergens ?? []);
        if (allergens.length > 0) out.allergens = allergens;
        if (item.hidden) out.hidden = true;
        if (item.soldOut) out.soldOut = true;
        return out;
      }),
    })),
  };
  if (errors.length > 0) return { ok: false, errors };
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > CONTENT_MAX_BYTES) {
    return {
      ok: false,
      errors: [{ path: 'content', message: `The content is over ${CONTENT_MAX_BYTES / 1024} KB` }],
    };
  }
  return { ok: true, content };
}

/** The content as stored; an empty one when what is stored isn't the expected shape. */
export function readContent(value: unknown): MenuContent {
  if (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { categories?: unknown }).categories)
  ) {
    return value as MenuContent;
  }
  return { categories: [] };
}

/** A new menu's content when none is given: one empty category. */
export function defaultContent(kind: MenuKindValue, language: MenuLanguageValue): MenuContent {
  const names = {
    MENU: { ES: 'Carta', EN: 'Menu' },
    CATALOGUE: { ES: 'Catálogo', EN: 'Catalogue' },
  } as const;
  return { categories: [{ key: newKey(), name: names[kind][language], items: [] }] };
}

/** What the public page gets: hidden items and the categories left empty by that are dropped. */
export function publicContent(content: MenuContent, kind: MenuKindValue): MenuContent {
  const categories = content.categories
    .map((category) => ({
      key: category.key,
      name: category.name,
      items: category.items
        .filter((item) => !item.hidden)
        .map(({ hidden: _hidden, allergens, ...item }) => ({
          ...item,
          ...(kind === 'MENU' && allergens && allergens.length > 0 ? { allergens } : {}),
        })),
    }))
    .filter((category) => category.items.length > 0);
  return { categories };
}

/** A catalogue has no allergens: used when a menu is turned into one. */
export function withoutAllergens(content: MenuContent): MenuContent {
  return {
    categories: content.categories.map((category) => ({
      ...category,
      items: category.items.map(({ allergens: _allergens, ...item }) => item),
    })),
  };
}

/** The content with the item's availability changed; null when no item has that key. */
export function withItemFlags(
  content: MenuContent,
  key: string,
  flags: { hidden?: boolean; soldOut?: boolean },
): MenuContent | null {
  let found = false;
  const categories = content.categories.map((category) => ({
    ...category,
    items: category.items.map((item) => {
      if (item.key !== key) return item;
      found = true;
      const next: MenuItem = { ...item };
      for (const flag of ['hidden', 'soldOut'] as const) {
        const value = flags[flag];
        if (value === undefined) continue;
        if (value) next[flag] = true;
        else delete next[flag];
      }
      return next;
    }),
  }));
  return found ? { categories } : null;
}
