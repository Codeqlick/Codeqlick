/**
 * Renders the Markdown subset of news posts (architecture 8.2): paragraphs (blank line),
 * `**bold**`, `*italic*`, `[text](url)` links and `-` lists. Pure and dependency free.
 *
 * Safety: every piece of text is HTML-escaped before any tag is added, so the result can go into
 * `set:html` as is. No HTML or images are allowed; links must be http, https, mailto or tel (any
 * other stays as the literal text) and get `rel="noopener nofollow ugc"`.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

const SAFE_LINK = /^(?:https?:\/\/|mailto:|tel:)[^\s<>"']+$/i;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Bold and italics over text that is already escaped (it has no tags to confuse). */
function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, '<em>$1</em>');
}

const plain = (text: string): string => emphasis(escapeHtml(text));

/** Inline formatting of one line of text. */
function inline(text: string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, url] = match as unknown as [string, string, string];
    out += plain(text.slice(last, match.index));
    out += SAFE_LINK.test(url)
      ? `<a href="${escapeHtml(url)}" rel="noopener nofollow ugc">${plain(label)}</a>`
      : escapeHtml(whole);
    last = match.index + whole.length;
  }
  return out + plain(text.slice(last));
}

/** The post body as safe HTML: `<p>` and `<ul>` blocks. */
export function renderMarkdown(source: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    }
    list = [];
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const item = /^-\s+(.+)$/.exec(line);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (item) {
      flushParagraph();
      list.push(item[1]!);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks.join('\n');
}
