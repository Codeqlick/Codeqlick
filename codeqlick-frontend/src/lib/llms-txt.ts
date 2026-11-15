/**
 * /llms.txt: a Markdown map of the website for AI assistants, in the format of llmstxt.org
 * (architecture 6.2, "llms.txt"). Pure: the route handler gathers the texts (English messages)
 * and the published content, this builds the file. No prices and nothing behind sign-in.
 */

/** How many case studies and posts the file lists at most. */
export const LLMS_LIST_SIZE = 20;

/** A page linked from the file: its title and an optional one-line note. */
export type LlmsPage = { title: string; note?: string };

export type LlmsTxtInput = {
  /** The website's origin without a trailing slash: https://codeqlick.com */
  siteUrl: string;
  /** The locale of the linked pages (the file is in English: 'en'). */
  locale: string;
  name: string;
  tagline: string;
  /** One sentence on what the studio does. */
  summary: string;
  email: string;
  pages: {
    services: LlmsPage;
    basicWebsite: LlmsPage;
    basicWebsiteRequest: LlmsPage;
    /** Codeqlick Cloud's landing, on its own host (an absolute URL). */
    cloud: LlmsPage & { url: string };
    websiteCheck: LlmsPage;
    work: LlmsPage;
    blog: LlmsPage;
    about: LlmsPage;
    contact: LlmsPage;
    security: LlmsPage;
  };
  /** Each service page (`/services/<slug>`), in the site's order. */
  services: (LlmsPage & { slug: string })[];
  /** Published case studies in the list's order; null when the API couldn't be read. */
  caseStudies: { slug: string; title: string; summary: string }[] | null;
  /** The latest published posts; null when the API couldn't be read. */
  posts: { slug: string; title: string; excerpt: string }[] | null;
  /** The legal notice and privacy policy, only while they are published (LEGAL_OWNER_NAME set). */
  legal: { legal: LlmsPage; privacy: LlmsPage } | null;
};

/**
 * Text on one line that can't break a Markdown list item: whitespace (newlines included)
 * collapsed to single spaces, and backslashes, square brackets and backticks escaped.
 */
export function markdownInline(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\[\]`]/g, '\\$&');
}

/** The first sentence of `text` (up to the first `.`, `!` or `?` followed by a space or the end). */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  return /^.*?[.!?](?=\s|$)/s.exec(trimmed)?.[0] ?? trimmed;
}

/** A slug as a path segment; parentheses are encoded too, since they end a Markdown link. */
function segment(slug: string): string {
  return encodeURIComponent(slug).replace(
    /[()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function linkLine(page: LlmsPage, url: string): string {
  const note = page.note ? markdownInline(page.note) : '';
  return `- [${markdownInline(page.title)}](${url})${note ? `: ${note}` : ''}`;
}

function section(title: string, lines: string[]): string {
  return `## ${title}\n\n${lines.join('\n')}`;
}

/** The whole file, ending with a newline. */
export function buildLlmsTxt(input: LlmsTxtInput): string {
  const { pages, locale } = input;
  const url = (path: string) => `${input.siteUrl}/${locale}${path}`;

  const sections = [
    section('Services', [
      linkLine(pages.services, url('/services')),
      ...input.services.map((service) =>
        linkLine(service, url(`/services/${segment(service.slug)}`)),
      ),
    ]),
    section('Basic website', [
      linkLine(pages.basicWebsite, url('/basic-website')),
      linkLine(pages.basicWebsiteRequest, url('/basic-website/request')),
    ]),
    section('Codeqlick Cloud', [linkLine(pages.cloud, pages.cloud.url)]),
    section('Free website check', [linkLine(pages.websiteCheck, url('/website-check'))]),
  ];

  if (input.caseStudies) {
    sections.push(
      section('Case studies', [
        linkLine(pages.work, url('/work')),
        ...input.caseStudies
          .slice(0, LLMS_LIST_SIZE)
          .map((item) =>
            linkLine({ title: item.title, note: item.summary }, url(`/work/${segment(item.slug)}`)),
          ),
      ]),
    );
  }

  if (input.posts) {
    sections.push(
      section('Blog', [
        linkLine(pages.blog, url('/blog')),
        ...input.posts
          .slice(0, LLMS_LIST_SIZE)
          .map((post) =>
            linkLine({ title: post.title, note: post.excerpt }, url(`/blog/${segment(post.slug)}`)),
          ),
      ]),
    );
  }

  sections.push(
    section('About and contact', [
      linkLine(pages.about, url('/about')),
      linkLine(pages.contact, url('/contact')),
      linkLine(pages.security, url('/security')),
      ...(input.legal
        ? [
            linkLine(input.legal.legal, url('/legal')),
            linkLine(input.legal.privacy, url('/privacy')),
          ]
        : []),
    ]),
  );

  const intro = [
    `# ${markdownInline(input.name)}`,
    `> ${markdownInline(`${input.tagline}. ${input.summary}`)}`,
    `The links below are the English pages; each one also exists in Spanish, with \`/es/\` in place of \`/en/\`. Email: ${input.email}`,
  ];

  return `${[...intro, ...sections].join('\n\n')}\n`;
}
