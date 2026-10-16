import { describe, expect, it } from 'vitest';
import { csvField, leadsToCsv } from './leads-csv.js';
import type { Lead } from './leads.service.js';

const lead: Lead = {
  id: 'b2c1e1d4-0000-4000-8000-000000000001',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  company: 'Pérez, S.L.',
  budget: null,
  projectType: null,
  message: 'Line one\nShe said "hi"',
  locale: 'es',
  status: 'NEW',
  notes: null,
  lostReason: null,
  followUpOn: null,
  clientId: null,
  siteRequest: null,
  preview: null,
  proposalId: null,
  createdAt: '2026-10-14T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
};

describe('leads CSV', () => {
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
  });

  it('writes a BOM, a header row and CRLF line endings', () => {
    const csv = leadsToCsv([lead]);
    expect(
      csv.startsWith(
        '﻿created_at,name,email,company,project_type,budget,status,lost_reason,follow_up_on,locale,message,notes,id\r\n',
      ),
    ).toBe(true);
    expect(csv).toContain(
      '2026-10-14T10:00:00.000Z,Ana Pérez,ana@example.com,"Pérez, S.L.",,,NEW,,,es,"Line one\nShe said ""hi""",,b2c1e1d4-0000-4000-8000-000000000001\r\n',
    );
  });
});
