import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { changeAgainst } from '@/lib/analytics-change';
import { AnalyticsChange } from './AnalyticsChange';

const classNames = { up: 'u', down: 'd', same: 's', new: 'n' };
const render = (current: number, previous: number) => {
  const change = changeAgainst(current, previous);
  if (!change) return '';
  return renderToStaticMarkup(
    <AnalyticsChange
      change={change}
      text={(value) => `${value} vs previous 7 days`}
      newLabel="New"
      classNames={classNames}
    />,
  );
};

describe('changeAgainst', () => {
  it('is null when both are 0', () => expect(changeAgainst(0, 0)).toBeNull());
  it('is new when only the previous is 0', () =>
    expect(changeAgainst(5, 0)).toEqual({ kind: 'new', percent: 0 }));
  it('rounds to whole percent', () => {
    expect(changeAgainst(112, 100)).toEqual({ kind: 'up', percent: 12 });
    expect(changeAgainst(92, 100)).toEqual({ kind: 'down', percent: -8 });
    expect(changeAgainst(2, 3)).toEqual({ kind: 'down', percent: -33 });
  });
  it('is same when equal or when it rounds to 0', () => {
    expect(changeAgainst(4, 4)).toEqual({ kind: 'same', percent: 0 });
    expect(changeAgainst(1001, 1000)).toEqual({ kind: 'same', percent: 0 });
  });
  it('is down 100 % when the current is 0', () =>
    expect(changeAgainst(0, 10)).toEqual({ kind: 'down', percent: -100 }));
});

describe('AnalyticsChange', () => {
  it('writes the sign and the period in the text', () => {
    expect(render(112, 100)).toBe(
      '<span class="u" data-change="up">+12 % vs previous 7 days</span>',
    );
    expect(render(92, 100)).toContain('−8 % vs previous 7 days');
    expect(render(92, 100)).toContain('class="d"');
    expect(render(5, 5)).toContain('0 % vs previous 7 days');
  });
  it('shows New', () => expect(render(3, 0)).toContain('>New<'));
  it('renders nothing when both are 0', () => expect(render(0, 0)).toBe(''));
});
