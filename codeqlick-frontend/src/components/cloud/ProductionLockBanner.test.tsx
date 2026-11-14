import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductionLockBanner } from './ProductionLockBanner';

const title = 'Production is locked to abc1234 since 12 Nov 2026, 18:05, by Ana.';
const body = 'Production builds deploy as previews until someone publishes or unlocks.';

describe('ProductionLockBanner', () => {
  it('shows the message and the actions below it', () => {
    const html = renderToStaticMarkup(
      <ProductionLockBanner title={title} body={body}>
        <button type="submit">Unlock</button>
      </ProductionLockBanner>,
    );
    expect(html).toContain(`<strong>${title}</strong> ${body}`);
    // The form sits after the message, not inside it (its own messages are alerts).
    expect(html.indexOf('</strong>')).toBeLessThan(html.indexOf('<button'));
    expect(html).toMatch(/<\/div><div[^>]*><button/);
  });

  it('has no actions for members', () => {
    const html = renderToStaticMarkup(<ProductionLockBanner title={title} body={body} />);
    expect(html).not.toContain('<button');
    expect(html).toContain(body);
  });
});
