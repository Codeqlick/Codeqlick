import { describe, expect, it } from 'vitest';
import {
  buildLlmsTxt,
  firstSentence,
  LLMS_LIST_SIZE,
  type LlmsTxtInput,
  markdownInline,
} from './llms-txt';

const SITE = 'https://codeqlick.com';

function input(overrides: Partial<LlmsTxtInput> = {}): LlmsTxtInput {
  return {
    siteUrl: SITE,
    locale: 'en',
    name: 'Codeqlick',
    tagline: 'Redefining information technology in society',
    summary: 'Codeqlick designs and builds custom software and web applications.',
    email: 'hello@codeqlick.com',
    pages: {
      services: { title: 'Services', note: 'What we build.' },
      basicWebsite: { title: 'Basic website', note: 'A one-page website.' },
      basicWebsiteRequest: { title: 'Request your basic website' },
      cloud: {
        title: 'Codeqlick Cloud',
        note: 'Deploy static sites.',
        url: 'https://cloud.codeqlick.com/en',
      },
      websiteCheck: { title: 'Free website check', note: 'We check your website.' },
      work: { title: 'Work', note: 'Case studies.' },
      blog: { title: 'Blog', note: 'Notes from the studio.' },
      about: { title: 'About us', note: 'Who we are.' },
      contact: { title: 'Contact', note: 'Write to us.' },
      security: { title: 'Security: report a vulnerability', note: 'How to report.' },
    },
    services: [{ slug: 'web-applications', title: 'Web applications', note: 'SaaS platforms.' }],
    caseStudies: [{ slug: 'shop', title: 'A shop', summary: 'Online sales.' }],
    posts: [{ slug: 'hello', title: 'Hello', excerpt: 'First post.' }],
    legal: null,
    ...overrides,
  };
}

/** The `## ` headings of the file, in order. */
function headings(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3));
}

describe('buildLlmsTxt', () => {
  it('starts with the name and the tagline, then the sections with absolute links', () => {
    const text = buildLlmsTxt(input());
    expect(text.startsWith('# Codeqlick\n\n> Redefining information technology in society. ')).toBe(
      true,
    );
    expect(text).toContain('hello@codeqlick.com');
    expect(headings(text)).toEqual([
      'Services',
      'Basic website',
      'Codeqlick Cloud',
      'Free website check',
      'Case studies',
      'Blog',
      'About and contact',
    ]);
    expect(text).toContain(`- [Services](${SITE}/en/services): What we build.`);
    expect(text).toContain(
      `- [Web applications](${SITE}/en/services/web-applications): SaaS platforms.`,
    );
    expect(text).toContain(`- [Basic website](${SITE}/en/basic-website): A one-page website.`);
    expect(text).toContain(`- [Request your basic website](${SITE}/en/basic-website/request)\n`);
    expect(text).toContain('- [Codeqlick Cloud](https://cloud.codeqlick.com/en): Deploy static');
    expect(text).toContain(`- [Free website check](${SITE}/en/website-check):`);
    expect(text).toContain(`- [Work](${SITE}/en/work): Case studies.`);
    expect(text).toContain(`- [A shop](${SITE}/en/work/shop): Online sales.`);
    expect(text).toContain(`- [Blog](${SITE}/en/blog): Notes from the studio.`);
    expect(text).toContain(`- [Hello](${SITE}/en/blog/hello): First post.`);
    expect(text).toContain(`- [About us](${SITE}/en/about):`);
    expect(text).toContain(`- [Contact](${SITE}/en/contact):`);
    expect(text).toContain(`- [Security: report a vulnerability](${SITE}/en/security):`);
    expect(text.endsWith('\n')).toBe(true);
    // Every link is absolute.
    for (const [, url] of text.matchAll(/\]\(([^)]*)\)/g)) expect(url).toMatch(/^https:\/\//);
  });

  it('escapes brackets and newlines so a title or note cannot break the list', () => {
    const text = buildLlmsTxt(
      input({
        posts: [
          {
            slug: 'tricky',
            title: 'Arrays [and] links](https://evil.example)\nInjected',
            excerpt: 'Line one\n\n## Not a heading\r\n- [x](y)',
          },
        ],
      }),
    );
    const line = text.split('\n').find((l) => l.includes('/en/blog/tricky'));
    expect(line).toBe(
      `- [Arrays \\[and\\] links\\](https://evil.example) Injected](${SITE}/en/blog/tricky): ` +
        'Line one ## Not a heading - \\[x\\](y)',
    );
    expect(headings(text)).not.toContain('Not a heading');
  });

  it('lists the legal notice and the privacy policy only when they are published', () => {
    const without = buildLlmsTxt(input());
    expect(without).not.toContain('/en/legal');
    expect(without).not.toContain('/en/privacy');

    const withLegal = buildLlmsTxt(
      input({
        legal: {
          legal: { title: 'Legal notice', note: 'Who owns the site.' },
          privacy: { title: 'Privacy policy', note: 'What data we handle.' },
        },
      }),
    );
    expect(withLegal).toContain(`- [Legal notice](${SITE}/en/legal): Who owns the site.`);
    expect(withLegal).toContain(`- [Privacy policy](${SITE}/en/privacy): What data we handle.`);
  });

  it('leaves out the content sections the API could not provide', () => {
    const text = buildLlmsTxt(input({ caseStudies: null, posts: null }));
    expect(headings(text)).toEqual([
      'Services',
      'Basic website',
      'Codeqlick Cloud',
      'Free website check',
      'About and contact',
    ]);
    expect(text).not.toContain('/en/work');
    expect(text).not.toContain('/en/blog');
  });

  it('keeps the list pages when nothing is published yet, and lists at most 20 items', () => {
    const many = Array.from({ length: LLMS_LIST_SIZE + 5 }, (_, i) => ({
      slug: `post-${i}`,
      title: `Post ${i}`,
      excerpt: '',
    }));
    const text = buildLlmsTxt(input({ caseStudies: [], posts: many }));
    expect(text).toContain(`- [Work](${SITE}/en/work)`);
    expect(text.match(/\/en\/blog\/post-/g)).toHaveLength(LLMS_LIST_SIZE);
    // An empty note leaves no trailing colon.
    expect(text).toContain(`- [Post 0](${SITE}/en/blog/post-0)\n`);
  });

  it('encodes slugs so they cannot end the link', () => {
    const text = buildLlmsTxt(input({ posts: [{ slug: 'a(b)', title: 'T', excerpt: '' }] }));
    expect(text).toContain(`(${SITE}/en/blog/a%28b%29)`);
  });
});

describe('llms.txt helpers', () => {
  it('writes text on one line with brackets escaped', () => {
    expect(markdownInline('  a\n b\t[c]\\ ')).toBe('a b \\[c\\]\\\\');
    expect(markdownInline('run `npm ci')).toBe('run \\`npm ci');
  });

  it('takes the first sentence', () => {
    expect(firstSentence('Codeqlick builds software. Redefining it.')).toBe(
      'Codeqlick builds software.',
    );
    expect(firstSentence('Version 1.2 is out! Read on.')).toBe('Version 1.2 is out!');
    expect(firstSentence('No full stop')).toBe('No full stop');
  });
});
