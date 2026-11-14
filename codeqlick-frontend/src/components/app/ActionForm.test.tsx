import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormRadioGroup } from './ActionForm';

const render = (defaultValue?: string) =>
  renderToStaticMarkup(
    <FormRadioGroup
      name="access"
      legend="Access"
      defaultValue={defaultValue}
      options={[
        { value: 'full', label: 'Full', hint: 'Deploys and changes projects.' },
        { value: 'readOnly', label: 'Read only', hint: 'Can only list and read.' },
      ]}
    />,
  );

describe('FormRadioGroup', () => {
  it('names the choice with a fieldset legend and labels every radio', () => {
    const html = render('full');
    expect(html).toMatch(/^<fieldset[^>]*><legend>Access<\/legend>/);
    expect(html).toContain('<label for="access-full"');
    expect(html).toContain('<label for="access-readOnly"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html.match(/name="access"/g)).toHaveLength(2);
  });

  it('links each hint and ticks the default', () => {
    const html = render('full');
    expect(html).toMatch(/<input[^>]*id="access-full"[^>]*aria-describedby="access-full-hint"/);
    expect(html).toContain('<p id="access-readOnly-hint"');
    // Attribute order is React's, so look at each radio's own tag.
    const input = (value: string) =>
      html.match(new RegExp(`<input[^>]*value="${value}"[^>]*>`))?.[0];
    expect(input('full')).toContain('checked=""');
    expect(input('readOnly')).toBeDefined();
    expect(input('readOnly')).not.toContain('checked');
  });

  it('ticks nothing without a default', () => {
    expect(render()).not.toContain('checked');
  });
});
