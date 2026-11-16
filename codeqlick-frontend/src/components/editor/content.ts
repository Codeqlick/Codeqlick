/**
 * The website editor's helpers (architecture 8.2): reading and writing the content by path, what
 * the draft's preview can show at once (texts marked `data-edit`, the theme's variables) and what
 * needs it rebuilt.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Content = { [key: string]: Json };

/** The value at `path` ("hero.title", "services.items.0.name"), or undefined. */
export function getAt(content: Json, path: string): Json | undefined {
  let node: Json | undefined = content;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node) ? node[Number(key)] : node[key];
  }
  return node;
}

/**
 * A copy of the content with `value` at `path` (objects and arrays on the way are copied, missing
 * ones created). `undefined` removes the key: optional fields left empty are not sent.
 */
export function setAt<T extends Json>(content: T, path: string, value: Json | undefined): T {
  const [key, ...rest] = path.split('.') as [string, ...string[]];
  const node = (content ?? {}) as Json;
  if (Array.isArray(node)) {
    const copy = [...node];
    const index = Number(key);
    if (rest.length === 0) {
      if (value === undefined) copy.splice(index, 1);
      else copy[index] = value;
    } else
      copy[index] = setAt(copy[index] ?? (/^\d+$/.test(rest[0]!) ? [] : {}), rest.join('.'), value);
    // Writing past the end (an English twin of a later item): the items before it are blank.
    const filler: Json =
      rest.length > 0 ? (/^\d+$/.test(rest[0]!) ? [] : {}) : typeof value === 'string' ? '' : {};
    for (let i = 0; i < copy.length; i++) if (copy[i] === undefined) copy[i] = filler;
    return copy as T;
  }
  const copy = { ...(node as { [key: string]: Json }) };
  if (rest.length === 0) {
    if (value === undefined) delete copy[key];
    else copy[key] = value;
  } else {
    copy[key] = setAt(copy[key] ?? (/^\d+$/.test(rest[0]!) ? [] : {}), rest.join('.'), value);
  }
  return copy as T;
}

/** The texts the draft's preview marks with `data-edit` (the template's components). */
const LIVE = [
  /^business\.(name|tagline|description)$/,
  /^navLabels\.\w+$/,
  /^hero\.(eyebrow|title|text|primary\.label|secondary\.label)$/,
  /^hero\.facts\.\d+\.(label|value)$/,
  /^services\.(title|intro|note)$/,
  /^services\.items\.\d+\.(name|price|description)$/,
  /^about\.(title|paragraphs\.\d+|highlights\.\d+)$/,
  /^gallery\.(title|intro)$/,
  /^testimonials\.title$/,
  /^testimonials\.items\.\d+\.(quote|author|detail)$/,
  /^banner\.(title|text|link\.label)$/,
  /^contactSection\.(title|intro)$/,
  /^hours\.\d+\.(days|hours)$/,
  /^notices\.\d+\.text$/,
  /^booking\.label$/,
  /^menu\.(title|intro|note)$/,
  /^menu\.categories\.\d+\.name$/,
  /^menu\.categories\.\d+\.items\.\d+\.(name|description|price)$/,
];
const isLive = (path: string) => LIVE.some((pattern) => pattern.test(path));

/** The texts with an English twin (decision 106; the API's `siteEnglishSchema`). */
const TRANSLATABLE = [
  /^business\.(tagline|description)$/,
  /^hero\.(eyebrow|title|text|image\.alt|primary\.label|secondary\.label)$/,
  /^hero\.facts\.\d+\.(value|label)$/,
  /^navLabels\.(services|about|gallery|testimonials)$/,
  /^services\.(title|intro|note)$/,
  /^services\.items\.\d+\.(name|description|price)$/,
  /^about\.(title|paragraphs\.\d+|highlights\.\d+|image\.alt)$/,
  /^gallery\.(title|intro)$/,
  /^gallery\.images\.\d+\.alt$/,
  /^testimonials\.title$/,
  /^testimonials\.items\.\d+\.(quote|detail)$/,
  /^banner\.(title|text|link\.label)$/,
  /^menu\.(title|intro|note)$/,
  /^menu\.categories\.\d+\.name$/,
  /^menu\.categories\.\d+\.items\.\d+\.(name|description|price)$/,
  /^booking\.label$/,
  /^notices\.\d+\.text$/,
  /^contactSection\.(title|intro)$/,
  /^hours\.\d+\.(days|hours)$/,
];

/** Whether the Spanish text at `path` has an English twin at `en.<path>`. */
export const isTranslatable = (path: string) => TRANSLATABLE.some((pattern) => pattern.test(path));

/** The English twin's path of a Spanish text. */
export const twinPath = (path: string) => `en.${path}`;

/**
 * The Spanish texts whose English twin is still empty (the English page shows them in Spanish).
 * Prices are left out: they are usually the same in both. So is the menu while it is off.
 */
export function missingEnglish(content: Content, { menu = true } = {}): string[] {
  const { en, english: _english, ...spanish } = content;
  const missing: string[] = [];
  walk(spanish as Content, '', (path, value) => {
    if (typeof value !== 'string' || !value.trim() || !isTranslatable(path)) return;
    if (path.endsWith('.price') || (!menu && path.startsWith('menu.'))) return;
    const twin = getAt(en ?? {}, path);
    if (typeof twin !== 'string' || !twin.trim()) missing.push(path);
  });
  return missing;
}

/**
 * The English twins of a list's items follow them when the Spanish list changes: `next` is the
 * list after removing `removed` or moving `from` to `to`. Undefined when there are no twins.
 */
export function followTwins(
  content: Content,
  path: string,
  length: number,
  change: { removed: number } | { from: number; to: number },
): Json[] | undefined {
  const twins = getAt(content, twinPath(path));
  if (!Array.isArray(twins)) return undefined;
  const sample = getAt(content, `${path}.0`);
  const blank: Json = typeof sample === 'string' ? '' : {};
  const next = Array.from({ length }, (_, i) => twins[i] ?? blank);
  if ('removed' in change) next.splice(change.removed, 1);
  else {
    const [item] = next.splice(change.from, 1);
    next.splice(change.to, 0, item!);
  }
  return next;
}

function walk(node: Json, path: string, visit: (path: string, value: Json) => void): void {
  if (node !== null && typeof node === 'object') {
    const entries = Array.isArray(node)
      ? node.map((v, i) => [String(i), v] as const)
      : Object.entries(node);
    for (const [key, value] of entries) walk(value, path ? `${path}.${key}` : key, visit);
  } else visit(path, node);
}

/**
 * Every live text, for the preview to patch at once; with the English version on, the English
 * page's texts too (`en.<path>`), the Spanish one where the English is empty.
 */
export function liveTexts(content: Content): Record<string, string> {
  const texts: Record<string, string> = {};
  const { en, ...spanish } = content;
  walk(spanish as Content, '', (path, value) => {
    if (typeof value !== 'string' || !isLive(path)) return;
    texts[path] = value;
    if (content.english === true) {
      const twin = getAt(en ?? {}, path);
      texts[twinPath(path)] = typeof twin === 'string' && twin.trim() ? twin : value;
    }
  });
  return texts;
}

/**
 * What only a rebuild shows: everything but the theme (variables) and the live texts, which only
 * count as being there or not (an empty one isn't rendered).
 */
export function structureOf(content: Content): string {
  const parts: string[] = [];
  walk({ ...content, theme: null }, '', (path, value) => {
    // An English text shows the Spanish one when empty, so only its value changes: live.
    if (path.startsWith('en.') && isLive(path.slice(3))) return;
    parts.push(
      `${path}=${typeof value === 'string' && isLive(path) ? (value ? 1 : 0) : JSON.stringify(value)}`,
    );
  });
  return parts.join('\n');
}

/** A day as the site's notices compare it (`YYYY-MM-DD`, local time). */
export function dayOf(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

export type NoticeState = 'showing' | 'scheduled' | 'over' | 'incomplete';

/** Whether a notice shows on the site on `today` (the template's Notices component). */
export function noticeState(notice: { from?: string; until?: string }, today: string): NoticeState {
  if (!notice.until) return 'incomplete';
  if (notice.until < today) return 'over';
  if (notice.from && notice.from > today) return 'scheduled';
  return 'showing';
}

const FONTS: Record<string, string> = {
  inter: "'Inter Variable', system-ui, sans-serif",
  outfit: "'Outfit Variable', system-ui, sans-serif",
  fraunces: "'Fraunces Variable', Georgia, serif",
  playfair: "'Playfair Display Variable', Georgia, serif",
};
const RADIUS: Record<string, [string, string]> = {
  square: ['0', '0'],
  soft: ['0.75rem', '0.6rem'],
  round: ['1.5rem', '999px'],
};

/** The theme as the template's CSS variables (web-basica's Base layout). */
export function themeVars(theme: Json | undefined): Record<string, string> {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return {};
  const t = theme as Record<string, string>;
  const radius = RADIUS[t.corners ?? 'soft'] ?? RADIUS.soft!;
  return {
    '--primary': t.primary ?? '',
    '--primary-text': t.primaryText ?? '',
    '--background': t.background ?? '',
    '--surface': t.surface ?? '',
    '--text': t.text ?? '',
    '--muted': t.muted ?? '',
    '--font-heading': FONTS[t.headingFont ?? ''] ?? '',
    '--font-body': FONTS[t.bodyFont ?? ''] ?? '',
    '--radius': radius[0],
    '--radius-button': radius[1],
    '--primary-strong': `color-mix(in srgb, ${t.primary} 80%, ${t.text})`,
  };
}

/** WCAG contrast ratio of two `#rrggbb` colours, or null when one isn't one. */
export function contrast(a: string, b: string): number | null {
  const luminance = (hex: string) => {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return null;
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(match[1]!.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luminance(a), luminance(b)];
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
