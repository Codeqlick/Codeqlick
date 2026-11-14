import { describe, expect, it } from 'vitest';
import { csvField, csvLine } from './csv.js';

describe('CSV fields', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField(null)).toBe('');
  });

  it('defuses values a spreadsheet would run as formulas', () => {
    expect(csvField('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvField('+34 600 000 000')).toBe("'+34 600 000 000");
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('\tx')).toBe("'\tx");
    expect(csvField('\rx')).toBe('"\'\rx"');
  });

  it('joins a line with commas and ends it with CRLF', () => {
    expect(csvLine(['a', null, 'b, c'])).toBe('a,,"b, c"\r\n');
  });
});
