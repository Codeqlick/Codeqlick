import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BypassReveal } from './BypassReveal';

// ActionForm pulls in the app's navigation (next/navigation), which doesn't load under Vitest;
// only the form state matters here.
const formState: { values?: Record<string, string> } = {};
vi.mock('@/components/app/ActionForm', () => ({ useFormState: () => formState }));
vi.mock('@/components/app/CopyLink', () => ({
  CopyLink: ({ url }: { url: string }) => <code>{url}</code>,
}));

const messages = {
  Cloud: {
    common: { copy: 'Copy', copied: 'Copied' },
    protection: {
      bypass: {
        shownOnce: 'Copy it now',
        headerLabel: 'Header',
        examples: 'Examples',
        playwright: 'Playwright',
        curl: 'curl',
      },
    },
  },
};

function render() {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BypassReveal />
    </NextIntlClientProvider>,
  );
}

describe('BypassReveal', () => {
  beforeEach(() => {
    delete formState.values;
  });

  it('shows nothing before a token was generated', () => {
    expect(render()).toBe('');
  });

  it('shows the new token and the header that sends it', () => {
    formState.values = { token: 'cqb_abc123' };
    const html = render();
    expect(html).toContain('cqb_abc123');
    expect(html).toContain('X-Codeqlick-Bypass: cqb_abc123');
  });
});
