import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BypassReveal } from './BypassReveal';

const messages = {
  Cloud: {
    common: { copy: 'Copy', copied: 'Copied' },
    protection: {
      bypass: { shownOnce: 'Copy it now', headerLabel: 'Header', examples: 'Examples' },
    },
  },
};

describe('BypassReveal', () => {
  it('shows nothing before a token was generated', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BypassReveal />
      </NextIntlClientProvider>,
    );
    expect(html).toBe('');
  });
});
