import { describe, expect, it } from 'vitest';
import { cloudDocsHref } from './cloud-docs-url';

describe('cloudDocsHref', () => {
  it('points at the documentation site in the locale when it is set', () => {
    expect(cloudDocsHref('https://docs.codeqlick.com', 'es')).toBe(
      'https://docs.codeqlick.com/es/',
    );
  });

  it("keeps the console's own page when it is not", () => {
    expect(cloudDocsHref(undefined, 'es')).toBe('/cloud/docs');
    expect(cloudDocsHref('', 'en')).toBe('/cloud/docs');
  });
});
