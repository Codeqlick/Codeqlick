import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerifiedBadge } from './VerifiedBadge';

describe('VerifiedBadge', () => {
  const help = 'The team checked a photo of this person holding their nickname';
  const html = renderToStaticMarkup(<VerifiedBadge label="Verified" help={help} />);

  it('shows the word and the tooltip', () => {
    expect(html).toContain('>Verified<');
    expect(html).toContain(`title="${help}"`);
  });

  it('hides the tick from screen readers and reads the help text', () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(help);
  });

  it('never claims an identity check', () => {
    expect(html.toLowerCase()).not.toContain('id checked');
  });
});
