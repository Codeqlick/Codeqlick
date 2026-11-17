import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdultUserOverview } from '@/lib/api/adult';
import { AdultOverviewView } from './AdultOverviewView';

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;
const date = (iso: string) => iso.slice(0, 10);

const base: AdultUserOverview = {
  userId: 'u1',
  name: 'Ana',
  email: 'ana@example.com',
  apps: [
    {
      app: 'CRUISING',
      enteredAt: '2026-10-01T00:00:00Z',
      name: 'ana_c',
      reportsReceived: { open: 1, dismissed: 0, actioned: 2, byReason: { MINOR: 1, SPAM: 2 } },
      reportsMade: 3,
      suspension: null,
    },
    {
      app: 'SWIPE',
      enteredAt: null,
      name: null,
      reportsReceived: { open: 0, dismissed: 0, actioned: 0, byReason: {} },
      reportsMade: 0,
      suspension: null,
    },
    {
      app: 'VIDEOCHAT',
      enteredAt: '2026-10-05T00:00:00Z',
      name: 'ana',
      reportsReceived: { open: 0, dismissed: 1, actioned: 0, byReason: {} },
      reportsMade: 0,
      suspension: {
        since: '2026-11-10T00:00:00Z',
        until: null,
        reason: 'proof',
        category: 'MINOR',
        shared: true,
      },
    },
  ],
  sharedSuspensions: [
    {
      id: 's1',
      category: 'MINOR',
      sourceApp: 'VIDEOCHAT',
      reason: 'proof',
      until: null,
      createdAt: '2026-11-10T00:00:00Z',
      by: { id: 'a1', name: 'Admin' },
      liftedAt: null,
      liftedBy: null,
      liftReason: null,
      active: true,
    },
  ],
  blockedBy: 4,
  verification: {
    status: 'APPROVED',
    sourceApp: 'CRUISING',
    verifiedName: 'ana_c',
    sentAt: '2026-10-02T00:00:00Z',
    decidedAt: '2026-10-03T00:00:00Z',
    hasPhoto: true,
    history: [{ action: 'approved', at: '2026-10-03T00:00:00Z', by: 'Admin', details: null }],
  },
  link: null,
};

describe('AdultOverviewView', () => {
  const html = renderToStaticMarkup(<AdultOverviewView data={base} t={t} date={date} />);

  it('lists the three apps by name', () => {
    expect(html).toContain('>Cruising<');
    expect(html).toContain('>Swipe<');
    expect(html).toContain('>Videochat<');
  });

  it('says which apps the person has not entered', () => {
    expect(html).toContain('panel.notEntered');
    expect(html).toContain('panel.nameHere {&quot;name&quot;:&quot;ana_c&quot;}');
  });

  it('shows the reports received by status and reason', () => {
    expect(html).toContain('&quot;open&quot;:1,&quot;actioned&quot;:2,&quot;dismissed&quot;:0');
    expect(html).toContain('categories.MINOR 1');
    expect(html).toContain('categories.SPAM 2');
  });

  it('marks a suspension as shared, with its category and no end when permanent', () => {
    expect(html).toContain('panel.shared');
    expect(html).toContain('durations.permanent');
    expect(html).toContain('categories.MINOR');
  });

  it('shows the blocks, the shared suspensions and the verification history', () => {
    expect(html).toContain('panel.blockedBy {&quot;count&quot;:4}');
    expect(html).toContain('panel.active');
    expect(html).toContain('panel.verificationStatus.APPROVED');
    expect(html).toContain('2026-10-03 · approved · Admin');
  });

  it('says so when there is nothing shared and no verification', () => {
    const empty = renderToStaticMarkup(
      <AdultOverviewView
        data={{ ...base, sharedSuspensions: [], verification: null }}
        t={t}
        date={date}
      />,
    );
    expect(empty).toContain('panel.noShared');
    expect(empty).toContain('panel.noVerification');
  });
});
