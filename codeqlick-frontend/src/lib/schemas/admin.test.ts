import { describe, expect, it } from 'vitest';
import { milestoneSchema, parseDuration, portfolioFormSchema, projectFormSchema } from './admin';

const issues = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  );

const translation = (fields: Partial<Record<string, string>> = {}) => ({
  title: '',
  summary: '',
  content: '',
  testimonialQuote: '',
  testimonialRole: '',
  ...fields,
});

const caseStudy = (overrides: Record<string, unknown> = {}) => ({
  slug: 'acme-shop',
  status: 'DRAFT',
  publishedAt: '',
  coverImageUrl: '',
  clientName: '',
  testimonialAuthor: '',
  projectUrl: '',
  technologies: 'Next.js, , NestJS',
  sortOrder: '',
  en: translation({ title: 'Acme', summary: 'A shop.', content: 'Body.' }),
  es: translation(),
  ...overrides,
});

describe('portfolioFormSchema', () => {
  it('accepts a case study in English only and cleans its fields', () => {
    const result = portfolioFormSchema.safeParse(caseStudy());
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      clientName: null,
      testimonialAuthor: null,
      technologies: ['Next.js', 'NestJS'],
      sortOrder: 0,
    });
  });

  it('requires the English translation', () => {
    const result = portfolioFormSchema.safeParse(caseStudy({ en: translation() }));
    expect(issues(result)).toMatchObject({
      'en.title': 'required',
      'en.summary': 'required',
      'en.content': 'required',
    });
  });

  it('treats the testimonial as optional, but as a start of the Spanish translation', () => {
    expect(
      portfolioFormSchema.safeParse(
        caseStudy({
          testimonialAuthor: 'Marta',
          es: translation({ title: 'Acme', summary: 'Una tienda.', content: 'Cuerpo.' }),
        }),
      ).success,
    ).toBe(true);
    const onlyQuote = portfolioFormSchema.safeParse(
      caseStudy({ es: translation({ testimonialQuote: 'Muy buen trabajo.' }) }),
    );
    expect(issues(onlyQuote)).toEqual({
      'es.title': 'translationIncomplete',
      'es.summary': 'translationIncomplete',
      'es.content': 'translationIncomplete',
    });
  });

  it('rejects a malformed slug and a non-numeric order', () => {
    const result = portfolioFormSchema.safeParse(
      caseStudy({ slug: 'Acme Shop', sortOrder: 'first' }),
    );
    expect(Object.keys(issues(result)).toSorted()).toEqual(['slug', 'sortOrder']);
  });
});

describe('milestoneSchema', () => {
  it('needs a title and turns empty optional fields into null', () => {
    expect(
      milestoneSchema.safeParse({ title: ' Lanzamiento ', description: ' ', dueDate: '' }).data,
    ).toEqual({
      title: 'Lanzamiento',
      description: null,
      dueDate: null,
    });
    expect(
      issues(milestoneSchema.safeParse({ title: '', description: '', dueDate: '2026-13' })),
    ).toEqual({
      title: 'required',
      dueDate: 'date',
    });
  });
});

describe('projectFormSchema', () => {
  const project = (progress: string) => ({
    clientId: 'c1',
    name: 'Tienda',
    description: '',
    phase: 'DESIGN',
    progress,
    startDate: '',
    dueDate: '2026-12-15',
    stagingUrl: '',
    productionUrl: 'https://acme.example',
  });

  it('keeps progress between 0 and 100', () => {
    expect(projectFormSchema.safeParse(project('40')).data?.progress).toBe(40);
    expect(issues(projectFormSchema.safeParse(project('101')))).toEqual({ progress: 'progress' });
    expect(issues(projectFormSchema.safeParse(project('-1')))).toEqual({ progress: 'progress' });
  });
});

describe('parseDuration', () => {
  it('reads the usual ways of typing time spent', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1,5')).toBe(90);
    expect(parseDuration('2')).toBe(120);
    expect(parseDuration('1h 30m')).toBe(90);
    expect(parseDuration('45m')).toBe(45);
    expect(parseDuration('45 min')).toBe(45);
    expect(parseDuration('3h')).toBe(180);
  });

  it('refuses nothing, nonsense and more than a day', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('25')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
  });
});
