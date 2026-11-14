import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatMs, ResponseStats, type ResponseStatsLabels } from './ResponseStats';

const labels: ResponseStatsLabels = {
  group: 'Time window',
  windows: { '24h': '24 h', '7d': '7 days', '30d': '30 days' },
  median: 'Median',
  p95: '95th percentile',
  average: 'Average',
  empty: 'No response times yet',
  basedOn: {
    '24h': 'Based on 288 checks',
    '7d': 'Based on 2,016 checks',
    '30d': 'Based on 0 checks',
  },
};

const stats = {
  '24h': { checks: 288, median: 180, p95: 1300, average: 240 },
  '7d': { checks: 2016, median: 200, p95: 900, average: 260 },
  '30d': null,
};

describe('ResponseStats', () => {
  it('shows the 24 h window by default with the tiles and the check count', () => {
    const html = renderToStaticMarkup(<ResponseStats stats={stats} labels={labels} locale="en" />);
    expect(html).toContain('role="group"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>24 h</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>7 days</);
    expect(html).toContain('180 ms');
    expect(html).toContain('1.3 s');
    expect(html).toContain('240 ms');
    expect(html).toContain('Based on 288 checks');
    expect(html).not.toContain('No response times yet');
  });

  it('shows dashes and the empty text for a window without checks', () => {
    const html = renderToStaticMarkup(
      <ResponseStats stats={stats} labels={labels} locale="en" initial="30d" />,
    );
    expect(html.match(/—/g)).toHaveLength(3);
    expect(html).toContain('No response times yet');
    expect(html).not.toContain('Based on');
  });

  it('formats milliseconds and seconds per locale', () => {
    expect(formatMs(480, 'en')).toBe('480 ms');
    expect(formatMs(1200, 'en')).toBe('1.2 s');
    expect(formatMs(1200, 'es')).toBe('1,2 s');
  });
});
