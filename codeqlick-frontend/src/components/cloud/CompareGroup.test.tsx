import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompareGroup } from './CompareGroup';

const labels = { path: 'Path', size: 'Size' };

describe('CompareGroup', () => {
  it('is open and lists the files when it has some', () => {
    const html = renderToStaticMarkup(
      <CompareGroup
        title="Added"
        help="In this deployment, not in production."
        count={2}
        items={[
          { path: 'a.html', size: 1 },
          { path: 'b.html', size: 2 },
        ]}
        locale="en"
        labels={labels}
        empty="None."
      />,
    );
    expect(html).toMatch(/^<details[^>]* open="">/);
    expect(html).toContain('<span>Added</span>');
    expect(html).toContain('>2</span>');
    expect(html).toContain('a.html');
    expect(html).toContain('b.html');
    expect(html).not.toContain('None.');
  });

  it('is collapsed and says so when empty', () => {
    const html = renderToStaticMarkup(
      <CompareGroup
        title="Removed"
        help="In production, not in this deployment."
        count={0}
        items={[]}
        locale="en"
        labels={labels}
        empty="None."
      />,
    );
    expect(html).not.toContain('open=""');
    expect(html).toContain('>0</span>');
    expect(html).toContain('None.');
    expect(html).not.toContain('<table');
  });

  it('counts the whole group and notes the rows left out', () => {
    const html = renderToStaticMarkup(
      <CompareGroup
        title="Changed"
        help="In both, with different content."
        count={1500}
        items={[{ path: 'a.html', size: 1, previousSize: 2 }]}
        locale="en"
        labels={labels}
        empty="None."
        more="500 more files aren't shown."
      />,
    );
    expect(html).toContain('>1,500</span>');
    expect(html).toContain('500 more files aren&#x27;t shown.');
  });
});
