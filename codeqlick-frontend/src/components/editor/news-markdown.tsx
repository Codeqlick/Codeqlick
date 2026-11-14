import { Fragment, type ReactNode } from 'react';

/**
 * The news body's Markdown subset (architecture 8.2), the same the site's template renders at
 * build time: paragraphs (a blank line; a single line break stays a line break), `**bold**`, `*italic*`, `[text](url)` links with an
 * `http`, `https`, `mailto` or `tel` address (any other stays as the text typed), and `-` lists. Everything else is plain
 * text.
 * It builds React elements (which escape their text) and never touches `dangerouslySetInnerHTML`.
 */

export type NewsInline =
  | { type: 'text'; value: string }
  | { type: 'br' }
  | { type: 'strong'; children: NewsInline[] }
  | { type: 'em'; children: NewsInline[] }
  | { type: 'link'; href: string; children: NewsInline[] };

export type NewsBlock =
  | { type: 'paragraph'; children: NewsInline[] }
  | { type: 'list'; items: NewsInline[][] };

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** The address when it may be linked (`http`, `https`, `mailto`, `tel`), otherwise null. */
export function safeNewsHref(href: string): string | null {
  if (/[\s<>"]/.test(href)) return null;
  try {
    const url = new URL(href);
    if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
    if (url.protocol.startsWith('http') && !url.hostname) return null;
    return href;
  } catch {
    return null;
  }
}

const LINK = /^\[([^\][]+)\]\(([^()\s]+)\)/;

function pushText(nodes: NewsInline[], value: string) {
  if (!value) return;
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') last.value += value;
  else nodes.push({ type: 'text', value });
}

/** Inline formatting of one line of text. An unclosed marker stays as the text it was. */
export function parseNewsInline(text: string): NewsInline[] {
  const nodes: NewsInline[] = [];
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    if (rest.startsWith('**')) {
      const end = text.indexOf('**', index + 2);
      const inner = end > index + 2 ? text.slice(index + 2, end) : '';
      if (inner.trim() && !/^\s|\s$/.test(inner)) {
        nodes.push({ type: 'strong', children: parseNewsInline(inner) });
        index = end + 2;
        continue;
      }
    } else if (rest.startsWith('*')) {
      const end = text.indexOf('*', index + 1);
      const inner = end > index + 1 ? text.slice(index + 1, end) : '';
      if (inner.trim() && !/^\s|\s$/.test(inner)) {
        nodes.push({ type: 'em', children: parseNewsInline(inner) });
        index = end + 1;
        continue;
      }
    } else if (rest.startsWith('[')) {
      const match = LINK.exec(rest);
      if (match) {
        const href = safeNewsHref(match[2]!);
        // A link that may not be one stays as the text that was typed.
        if (href) nodes.push({ type: 'link', href, children: parseNewsInline(match[1]!) });
        else pushText(nodes, match[0]);
        index += match[0].length;
        continue;
      }
    }
    pushText(nodes, text[index]!);
    index += 1;
  }
  return nodes;
}

/** Blocks of the body: a list is consecutive `- ` lines, a paragraph the lines up to a blank one. */
export function parseNewsMarkdown(source: string): NewsBlock[] {
  const blocks: NewsBlock[] = [];
  let paragraph: string[] = [];
  let list: NewsInline[][] = [];
  const endParagraph = () => {
    if (paragraph.length > 0)
      blocks.push({
        type: 'paragraph',
        // A line break inside a paragraph is kept, as on the site.
        children: paragraph.flatMap((line, index) => [
          ...(index > 0 ? [{ type: 'br' } as const] : []),
          ...parseNewsInline(line),
        ]),
      });
    paragraph = [];
  };
  const endList = () => {
    if (list.length > 0) blocks.push({ type: 'list', items: list });
    list = [];
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const item = /^-\s+(.*)$/.exec(line);
    if (!line) {
      endParagraph();
      endList();
    } else if (item) {
      endParagraph();
      list.push(parseNewsInline(item[1]!));
    } else {
      endList();
      paragraph.push(line);
    }
  }
  endParagraph();
  endList();
  return blocks;
}

function renderInline(nodes: NewsInline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.value}</Fragment>;
      case 'br':
        return <br key={index} />;
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'link': {
        const external = /^https?:/i.test(node.href);
        return (
          <a
            key={index}
            href={node.href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener nofollow ugc' : undefined}
          >
            {renderInline(node.children)}
          </a>
        );
      }
    }
  });
}

/** The body as it will look on the site (without the site's own styles). */
export function NewsMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseNewsMarkdown(source);
  return (
    <div className={className}>
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index}>{renderInline(block.children)}</p>
        ) : (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
