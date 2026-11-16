import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { BucketAccess } from './BucketAccess';

// ActionForm pulls in the app's navigation (next/navigation) and the actions call the API: neither
// loads under Vitest, and only the markup matters here.
vi.mock('@/components/app/ActionForm', () => ({
  ActionForm: ({ children }: { children: ReactNode }) => <form>{children}</form>,
  FormTextarea: ({ name, defaultValue }: { name: string; defaultValue?: string }) => (
    <textarea name={name} defaultValue={defaultValue} />
  ),
  FormInput: ({ name, defaultValue }: { name: string; defaultValue?: string }) => (
    <input name={name} defaultValue={defaultValue} />
  ),
  FormCheckboxGroup: ({ name, defaultValues }: { name: string; defaultValues: string[] }) => (
    <fieldset data-name={name}>{defaultValues.join(',')}</fieldset>
  ),
}));
vi.mock('@/components/app/CopyLink', () => ({
  CopyLink: ({ url }: { url: string }) => <code>{url}</code>,
}));
vi.mock('../../../actions', () => ({
  setBucketPublicAction: () => undefined,
  saveBucketCorsAction: () => undefined,
}));

const PUBLIC_URL = 'https://s3.codeqlick.app/_public/site-assets/';

function render(options: { admin: boolean; isPublic: boolean; cors?: boolean }) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <BucketAccess
        locale="en"
        path="/team/site"
        projectId="p1"
        bucket={{
          id: 'b1',
          name: 'site-assets',
          public: options.isPublic,
          publicUrl: options.isPublic ? PUBLIC_URL : null,
          cors: options.cors
            ? {
                origins: ['https://example.com'],
                methods: ['GET', 'PUT'],
                headers: ['*'],
                exposeHeaders: ['ETag'],
                maxAge: 3600,
              }
            : null,
        }}
        admin={options.admin}
        publicCount={1}
        publicLimit={1}
      />
    </NextIntlClientProvider>,
  );
}

describe('BucketAccess', () => {
  it('warns about a public bucket and shows its address to copy', () => {
    const html = render({ admin: false, isPublic: true });
    expect(html).toContain('Public');
    expect(html).toContain('Anyone with the address can read every file.');
    expect(html).toContain(PUBLIC_URL);
  });

  it('shows no warning or address while private', () => {
    const html = render({ admin: true, isPublic: false });
    expect(html).not.toContain('Anyone with the address');
    expect(html).not.toContain(PUBLIC_URL);
  });

  it('gives admins the switch with the plan count', () => {
    const html = render({ admin: true, isPublic: false });
    expect(html).toContain('Turn on public read');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('1 of 1 public buckets on this plan');
    expect(render({ admin: true, isPublic: true })).toContain('Turn off public read');
  });

  it('shows members the state and the CORS rule without forms', () => {
    const html = render({ admin: false, isPublic: false, cors: true });
    expect(html).not.toContain('<form');
    expect(html).toContain('Public read: <strong>Off</strong>');
    expect(html).toContain('https://example.com');
    expect(html).toContain('GET, PUT');
  });

  it('fills the CORS form with the rule and offers Clear only when there is one', () => {
    const withRule = render({ admin: true, isPublic: false, cors: true });
    expect(withRule).toContain('Clear rule');
    expect(withRule).toContain('GET,PUT');
    const without = render({ admin: true, isPublic: false });
    expect(without).not.toContain('Clear rule');
    // A new rule starts with S3's usual read methods ticked.
    expect(without).toContain('GET,HEAD');
  });
});
