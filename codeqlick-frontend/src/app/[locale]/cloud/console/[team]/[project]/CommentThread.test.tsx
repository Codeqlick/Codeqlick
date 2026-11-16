import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CloudCommentThread } from '@/lib/api/cloud';
import en from '@/messages/en.json';
import { CommentThread } from './CommentThread';

// ActionForm pulls in the app's navigation (next/navigation) and the actions call the API: neither
// loads under Vitest, and only the markup matters here.
vi.mock('@/components/app/ActionForm', () => ({
  ActionForm: ({ children }: { children: ReactNode }) => <form>{children}</form>,
  FormTextarea: ({ id, name, label }: { id: string; name: string; label: string }) => (
    <label>
      {label}
      <textarea id={id} name={name} />
    </label>
  ),
}));
vi.mock('../../../actions', () => ({
  replyCommentAction: () => undefined,
  resolveCommentThreadAction: () => undefined,
  deleteCommentAction: () => undefined,
}));

const thread = (overrides: Partial<CloudCommentThread> = {}): CloudCommentThread => ({
  id: 't1',
  deploymentId: 'd0c1e2f3-0000-4000-8000-000000000001',
  deploymentShort: 'ab12cd34',
  path: '/pricing',
  x: 10,
  y: 20,
  selector: null,
  viewportWidth: 390,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: '2026-11-16T10:00:00.000Z',
  lastCommentAt: '2026-11-16T10:05:00.000Z',
  comments: [
    {
      id: 'c1',
      body: 'The <b>button</b> is <script>alert(1)</script> off',
      author: { id: 'u1', name: 'Ana' },
      mentions: [],
      createdAt: '2026-11-16T10:00:00.000Z',
    },
    {
      id: 'c2',
      body: 'Fixed @Ana',
      author: { id: 'u2', name: 'Luis' },
      mentions: [{ id: 'u1', name: 'Ana' }],
      createdAt: '2026-11-16T10:05:00.000Z',
    },
  ],
  ...overrides,
});

function render(props: Partial<Parameters<typeof CommentThread>[0]> = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CommentThread
        locale="en"
        path="/team/site"
        projectId="p1"
        thread={thread()}
        meId="u1"
        admin={false}
        members={[{ id: 'u2', name: 'Luis' }]}
        commentRoute="/en/cloud/console/team/site/comment"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const count = (html: string, text: string) => html.split(text).length - 1;

describe('CommentThread', () => {
  it('shows comments as plain text, never as HTML', () => {
    const bodies = [...render().matchAll(/<p class="[^"]*commentBody[^"]*">(.*?)<\/p>/g)].map(
      (match) => match[1],
    );
    expect(bodies).toEqual([
      'The &lt;b&gt;button&lt;/b&gt; is &lt;script&gt;alert(1)&lt;/script&gt; off',
      'Fixed @Ana',
    ]);
  });

  it('shows the deployment, the page and a mobile hint for narrow frames', () => {
    const html = render();
    expect(html).toContain('ab12cd34');
    expect(html).toContain('/pricing');
    expect(html).toContain('Mobile');
    expect(render({ thread: thread({ viewportWidth: 1280 }) })).toContain('Desktop');
  });

  it('lets a member delete only their own comments, and an admin any', () => {
    expect(count(render(), '>Delete<')).toBe(1);
    expect(count(render({ admin: true }), '>Delete<')).toBe(2);
    expect(count(render({ meId: 'u9' }), '>Delete<')).toBe(0);
  });

  it('opens the preview through the console route while the deployment exists', () => {
    const html = render();
    expect(html).toContain(
      'href="/en/cloud/console/team/site/comment?deployment=d0c1e2f3-0000-4000-8000-000000000001&amp;path=%2Fpricing"',
    );
    expect(html).toContain('target="_blank"');
    const gone = render({ thread: thread({ deploymentId: null }) });
    expect(gone).not.toContain('Open on the preview');
    expect(gone).toContain('deployment has been deleted');
  });

  it('offers Resolve on open threads and Reopen on resolved ones', () => {
    expect(render()).toContain('Resolve');
    const resolved = render({
      thread: thread({
        resolvedAt: '2026-11-16T11:00:00.000Z',
        resolvedBy: { id: 'u2', name: 'Luis' },
      }),
    });
    expect(resolved).toContain('Reopen');
    expect(resolved).toContain('Resolved by Luis');
  });

  it('lists the team for mentions', () => {
    const html = render();
    expect(html).toContain('name="mentions"');
    expect(html).toContain('value="u2"');
  });
});
