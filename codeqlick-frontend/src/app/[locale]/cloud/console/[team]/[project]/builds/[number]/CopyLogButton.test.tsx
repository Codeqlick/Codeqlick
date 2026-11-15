import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CopyLogButton } from './CopyLogButton';

describe('CopyLogButton', () => {
  it('renders a button with the copy label before anything is copied', () => {
    const html = renderToStaticMarkup(
      <CopyLogButton text="npm run build" labels={{ copy: 'Copy log', copied: 'Copied' }} />,
    );
    expect(html).toContain('<button type="button"');
    expect(html).toContain('Copy log');
    expect(html).not.toContain('Copied');
  });
});
