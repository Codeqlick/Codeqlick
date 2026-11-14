import { describe, expect, it } from 'vitest';
import { leadsToCsv } from './leads-csv.js';
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
  prospect: false,
  createdAt: '2026-10-14T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
};

describe('leads CSV', () => {
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
