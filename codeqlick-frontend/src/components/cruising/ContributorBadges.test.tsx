import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContributorBadges } from './ContributorBadges';

const labels = {
  EXPLORER: { label: 'Explorer', help: 'Has 3 or more published spots' },
  GUIDE: { label: 'Guide', help: 'Has 10 or more published spots' },
  HELPFUL: { label: 'Helpful', help: 'Their reviews were marked helpful 10 or more times' },
  LOCAL: { label: 'Local', help: 'Has written 25 or more reviews' },
};

describe('ContributorBadges', () => {
  it('shows each badge with its meaning as the tooltip and for screen readers', () => {
    const html = renderToStaticMarkup(
      <ContributorBadges badges={['GUIDE', 'LOCAL']} labels={labels} />,
    );
    expect(html).toContain('Guide');
    expect(html).toContain(`title="${labels.GUIDE.help}"`);
    expect(html).toContain(`. ${labels.LOCAL.help}`);
    expect(html).not.toContain('Explorer');
  });

  it('shows nothing without badges', () => {
    expect(renderToStaticMarkup(<ContributorBadges badges={[]} labels={labels} />)).toBe('');
  });
});
