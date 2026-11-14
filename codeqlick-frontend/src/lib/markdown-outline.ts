import type { Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

/** A `##` heading of a text and the `###` headings under it (architecture 6.2). */
export type OutlineEntry = {
  id: string;
  text: string;
  children: { id: string; text: string }[];
};

/**
 * The anchor of a heading: lower case, accents dropped, anything other than `a-z` and `0-9`
 * collapsed to one `-`, trimmed; `section` when nothing is left.
 */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

/** A node's plain text: inline code, emphasis and links flattened; raw HTML left out. */
function plainText(node: Nodes): string {
  if (node.type === 'html') return '';
  if (node.type === 'break') return ' ';
  if ('value' in node) return node.value;
  if (node.type === 'image') return node.alt ?? '';
  if ('children' in node) return node.children.map((child) => plainText(child)).join('');
  return '';
}

/** Ids the page layouts already use: a heading with one of them is numbered instead. */
const RESERVED_IDS = ['main', 'app-main', 'mobile-nav-panel', 'footer-studio', 'footer-clients'];

type AnchoredHeading = { depth: 2 | 3; id: string; text: string };

/**
 * Gives every `##` and `###` of the tree its anchor (`data.hProperties.id`, which becomes the
 * element's `id`), a repeated one getting `-2`, `-3`… in order of appearance. The one place ids are
 * made, so the rendered headings and the outline always match.
 */
function anchorHeadings(tree: Root): AnchoredHeading[] {
  const used = new Set<string>(RESERVED_IDS);
  const headings: AnchoredHeading[] = [];
  const walk = (node: Nodes) => {
    if (node.type === 'heading' && (node.depth === 2 || node.depth === 3)) {
      const text = plainText(node).replace(/\s+/g, ' ').trim();
      const base = slugify(text);
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      // `hProperties` is read by mdast-util-to-hast (react-markdown) into the element's attributes.
      Object.assign((node.data ??= {}), { hProperties: { id } });
      headings.push({ depth: node.depth, id, text });
      return;
    }
    if ('children' in node) for (const child of node.children) walk(child);
  };
  walk(tree);
  return headings;
}

/** Remark plugin for `Markdown` with `anchors`: ids on `##` and `###`. */
export function remarkHeadingAnchors() {
  return (tree: Root) => {
    anchorHeadings(tree);
  };
}

/**
 * The `##` headings of a Markdown text with their `###` nested, ids as `Markdown` with `anchors`
 * renders them. A `###` before the first `##` belongs to no entry and is left out.
 */
export function getOutline(markdown: string): OutlineEntry[] {
  const outline: OutlineEntry[] = [];
  for (const { depth, id, text } of anchorHeadings(fromMarkdown(markdown))) {
    if (depth === 2) outline.push({ id, text, children: [] });
    else outline.at(-1)?.children.push({ id, text });
  }
  return outline;
}
