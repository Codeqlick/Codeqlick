import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/en.json';
import { SPOT_TYPES } from '@/lib/cruising';
import { SpotImport } from './SpotImport';

const typeLabels = Object.fromEntries(
  SPOT_TYPES.map((type) => [type, messages.Cruising.types[type]]),
) as Record<(typeof SPOT_TYPES)[number], string>;

const render = () =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SpotImport action={() => Promise.resolve({ status: 'idle' })} typeLabels={typeLabels} />
    </NextIntlClientProvider>,
  );

describe('SpotImport', () => {
  it('labels the file, the format and the publish switch', () => {
    const html = render();
    expect(html).toContain('<label for="spot-import-file"');
    expect(html).toMatch(
      /<input[^>]*type="file"[^>]*name="file"|<input[^>]*name="file"[^>]*type="file"/,
    );
    expect(html).toContain('accept=".csv,.geojson,.json');
    expect(html).toContain('<label for="spot-import-format"');
    expect(html).toContain('<option value="geojson">GeoJSON</option>');
    expect(html).toMatch(/<input[^>]*id="spot-import-publish"[^>]*checked=""/);
  });

  it('waits for a file before checking, and for a check before importing', () => {
    const html = render();
    const button = (intent: string) =>
      html.match(new RegExp(`<button[^>]*value="${intent}"[^>]*>`))?.[0] ?? '';
    expect(button('check')).toContain('disabled=""');
    expect(button('import')).toContain('disabled=""');
    expect(html).not.toContain('<table');
  });
});
