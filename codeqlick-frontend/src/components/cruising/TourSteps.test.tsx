import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { TourSteps } from './TourSteps';

// The buttons' locale-aware links need Next's router, which a static render doesn't have.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const finish = () => Promise.resolve({ status: 'success' as const });

function render(stepCount: number) {
  const steps = Array.from({ length: stepCount }, (_, index) => ({
    id: `step-${index}`,
    title: `Step title ${index + 1}`,
    content: <p>Content {index + 1}</p>,
  }));
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ Cruising: en.Cruising }}>
      <TourSteps steps={steps} finish={finish} />
    </NextIntlClientProvider>,
  );
}

describe('TourSteps (decision 102)', () => {
  it('opens on the first step with Next and Skip, and says where it is', () => {
    const html = render(4);
    expect(html).toContain('aria-labelledby="cruising-tour-title"');
    expect(html).toContain('Welcome to Cruising');
    expect(html).toContain('Step 1 of 4');
    expect(html).toContain('Step title 1');
    expect(html).toContain('Content 1');
    expect(html).not.toContain('Content 2');
    expect(html).toContain('>Next<');
    expect(html).toContain('Skip the tour');
    expect(html).not.toContain('>Back<');
    expect(html).not.toContain('>Done<');
    // The progress dots are decoration: the text says the step.
    expect(html).toMatch(/<ol[^>]*aria-hidden="true"/);
  });

  it('offers Done when there is only one step', () => {
    const html = render(1);
    expect(html).toContain('>Done<');
    expect(html).not.toContain('>Next<');
  });
});
