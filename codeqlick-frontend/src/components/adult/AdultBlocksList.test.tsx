import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdultBlocksList } from './AdultBlocksList';

const props = {
  otherApp: 'A member of another 18+ app',
  blockedOn: (date: string) => `blocked on ${date}`,
  blockedIn: (app: string, date: string) => `blocked in ${app} on ${date}`,
  date: (iso: string) => iso.slice(0, 10),
  action: (block: { ref: string }) => <button type="button">Unblock {block.ref}</button>,
};

describe('AdultBlocksList', () => {
  const html = renderToStaticMarkup(
    <AdultBlocksList
      {...props}
      blocks={[
        { ref: 'r1', name: 'ana_cruz', sourceApp: 'SWIPE', createdAt: '2026-11-01T10:00:00Z' },
        { ref: 'r2', name: null, sourceApp: 'VIDEOCHAT', createdAt: '2026-11-02T10:00:00Z' },
        { ref: 'r3', name: 'old_one', sourceApp: null, createdAt: '2026-10-01T10:00:00Z' },
      ]}
    />,
  );

  it('names a person by their name in this app and tags the app of the block', () => {
    expect(html).toContain('<strong>ana_cruz</strong>');
    expect(html).toContain('blocked in Swipe on 2026-11-01');
  });

  it('says "a member of another 18+ app" when they have no name here', () => {
    expect(html).toContain('<strong>A member of another 18+ app</strong>');
    expect(html).toContain('blocked in Videochat on 2026-11-02');
  });

  it('leaves the app out on older rows', () => {
    expect(html).toContain('blocked on 2026-10-01');
  });

  it('gives every row its own unblock control', () => {
    expect(html).toContain('Unblock r1');
    expect(html).toContain('Unblock r2');
    expect(html).toContain('Unblock r3');
  });
});
