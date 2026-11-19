import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Menu } from '../../generated/prisma/client.js';
import { MenusAdminService } from './menus-admin.service.js';
import { MenusService } from './menus.service.js';

const NOW = new Date('2026-11-19T10:00:00Z');
const DAY = 86_400_000;
const owner: AuthUser = { id: 'u1', email: 'o@x.test', name: 'Owner', role: 'CLIENT' };
const admin: AuthUser = { id: 'a1', email: 'a@x.test', name: 'Admin', role: 'ADMIN' };

const content = {
  categories: [
    {
      key: 'cat00001',
      name: 'Entrantes',
      items: [
        { key: 'it000001', name: 'Croquetas', allergens: ['milk'] },
        { key: 'it000002', name: 'Secreto', hidden: true },
      ],
    },
  ],
};

function menu(over: Partial<Menu> = {}): Menu {
  return {
    id: 'm1',
    ownerId: 'u1',
    slug: 'bar-pepe',
    kind: 'MENU',
    businessName: 'Bar Pepe',
    language: 'ES',
    currency: 'EUR',
    title: 'Carta',
    intro: '',
    address: '',
    openingNote: '',
    note: '',
    content,
    revision: 3,
    enabled: true,
    indexable: true,
    suspendedAt: null,
    suspendedReason: null,
    slugChangedAt: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Menu;
}

const createInput = (over: Record<string, unknown> = {}) =>
  ({
    slug: 'bar-nuevo',
    kind: 'MENU',
    businessName: 'Bar Nuevo',
    language: 'ES',
    ...over,
  }) as never;

describe('MenusService (architecture 4.20)', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: MenusService;
  const config = {
    webappUrl: () => 'https://menu.codeqlick.com',
    siteUrl: 'https://codeqlick.com',
    leadsNotifyTo: 'hello@codeqlick.com',
  };

  beforeEach(() => {
    repo = {
      listByOwner: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(menu()),
      findBySlug: vi.fn().mockResolvedValue(null),
      findRedirect: vi.fn().mockResolvedValue(null),
      activeRedirects: vi.fn().mockResolvedValue([]),
      createWithinLimit: vi.fn().mockImplementation(async (_o, _m, data) => menu({ ...data })),
      update: vi
        .fn()
        .mockImplementation(async (_id, revision, data) =>
          menu({ ...data, revision: revision + 1 } as Partial<Menu>),
        ),
      delete: vi.fn().mockResolvedValue(undefined),
      sitemap: vi.fn().mockResolvedValue([]),
      createReport: vi.fn().mockResolvedValue({}),
    };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    service = new MenusService(repo as never, mail as never, config as never);
  });

  describe('create', () => {
    it('creates the menu with the defaults, in the short link, with one empty category', async () => {
      const created = await service.create(owner, createInput(), NOW);
      expect(repo.createWithinLimit).toHaveBeenCalledWith(
        'u1',
        1,
        expect.objectContaining({
          ownerId: 'u1',
          slug: 'bar-nuevo',
          currency: 'EUR',
          title: 'Carta',
          enabled: true,
          indexable: true,
        }),
        NOW,
      );
      expect(created.url).toBe('https://menu.codeqlick.com/bar-nuevo');
      expect(created.content.categories).toHaveLength(1);
    });

    it('refuses an invalid, a reserved and a `codeqlick` slug with 422 and the field', async () => {
      for (const slug of ['ab', 'editar', 'codeqlick-bar']) {
        const error = await service.create(owner, createInput({ slug }), NOW).catch((e) => e);
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error.getResponse().errors[0].path).toBe('slug');
      }
      expect(repo.createWithinLimit).not.toHaveBeenCalled();
    });

    it('lets an admin take a `codeqlick` slug', async () => {
      await service.create(admin, createInput({ slug: 'codeqlick-demo' }), NOW);
      expect(repo.createWithinLimit).toHaveBeenCalled();
    });

    it('refuses a link in a text or in the content with 422', async () => {
      const text = await service
        .create(owner, createInput({ intro: 'Mira www.bar.com' }), NOW)
        .catch((e) => e);
      expect(text).toBeInstanceOf(UnprocessableEntityException);
      expect(text.getResponse().errors).toEqual([
        { path: 'intro', message: 'Links are not allowed in a menu' },
      ]);
      const body = await service
        .create(
          owner,
          createInput({
            content: { categories: [{ name: 'A', items: [{ name: 'http://x.com' }] }] },
          }),
          NOW,
        )
        .catch((e) => e);
      expect(body.getResponse().errors[0].path).toBe('content.categories.0.items.0.name');
    });

    it('answers 409 for a taken slug, also one another owner still has as a redirect', async () => {
      repo.findBySlug.mockResolvedValueOnce(menu({ id: 'other' }));
      await expect(service.create(owner, createInput(), NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      repo.findRedirect.mockResolvedValueOnce({
        slug: 'bar-nuevo',
        expiresAt: new Date(NOW.getTime() + DAY),
        menu: { id: 'other', ownerId: 'someone-else' },
      });
      await expect(service.create(owner, createInput(), NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('frees a slug whose redirect expired or is the owner’s own', async () => {
      repo.findRedirect.mockResolvedValueOnce({
        slug: 'bar-nuevo',
        expiresAt: new Date(NOW.getTime() - DAY),
        menu: { id: 'other', ownerId: 'someone-else' },
      });
      await service.create(owner, createInput(), NOW);
      repo.findRedirect.mockResolvedValueOnce({
        slug: 'bar-nuevo',
        expiresAt: new Date(NOW.getTime() + DAY),
        menu: { id: 'mine', ownerId: 'u1' },
      });
      await service.create(owner, createInput(), NOW);
      expect(repo.createWithinLimit).toHaveBeenCalledTimes(2);
    });

    it('answers 409 with code MENU_LIMIT past the free menu', async () => {
      repo.createWithinLimit.mockResolvedValue(null);
      const error = await service.create(owner, createInput(), NOW).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'MENU_LIMIT' });
    });

    it('answers 409 when the database says the slug is taken (a race)', async () => {
      repo.createWithinLimit.mockRejectedValue(Object.assign(new Error('x'), { code: 'P2002' }));
      await expect(service.create(owner, createInput(), NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('answers 404 for a menu that is not mine', async () => {
      repo.findById.mockResolvedValue(menu({ ownerId: 'someone-else' }));
      await expect(
        service.update(owner, 'm1', { revision: 3, title: 'x' }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 409 STALE_REVISION for an old revision, before and at the database', async () => {
      const early = await service
        .update(owner, 'm1', { revision: 2, title: 'x' }, NOW)
        .catch((e) => e);
      expect(early.getResponse()).toMatchObject({ code: 'STALE_REVISION' });
      expect(repo.update).not.toHaveBeenCalled();
      repo.update.mockResolvedValue(null);
      await expect(
        service.update(owner, 'm1', { revision: 3, title: 'x' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('changes the slug: the old one redirects for 180 days and the new one is taken over', async () => {
      await service.update(owner, 'm1', { revision: 3, slug: 'bar-pepe-2' }, NOW);
      expect(repo.update).toHaveBeenCalledWith(
        'm1',
        3,
        expect.objectContaining({ slug: 'bar-pepe-2' }),
        {
          claim: 'bar-pepe-2',
          leave: { slug: 'bar-pepe', expiresAt: new Date(NOW.getTime() + 180 * DAY) },
        },
        NOW,
      );
    });

    it('counts the changes of the last 30 days from the menu itself and allows 3', async () => {
      const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);
      repo.findById.mockResolvedValue(menu({ slugChangedAt: [at(1), at(10), at(29)] }));
      const error = await service
        .update(owner, 'm1', { revision: 3, slug: 'otro-bar' }, NOW)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'SLUG_CHANGE_LIMIT' });
      expect(repo.update).not.toHaveBeenCalled();

      // A change older than 30 days no longer counts, and the record keeps only the recent ones.
      repo.findById.mockResolvedValue(menu({ slugChangedAt: [at(40), at(10), at(5)] }));
      await service.update(owner, 'm1', { revision: 3, slug: 'otro-bar' }, NOW);
      const data = repo.update.mock.calls[0]?.[2] as { slugChangedAt: { set: Date[] } };
      expect(data.slugChangedAt.set).toEqual([at(10), at(5), NOW]);
    });

    it('counts taking back an old slug of its own like any other change', async () => {
      repo.findRedirect.mockResolvedValue({
        slug: 'viejo',
        menuId: 'm1',
        expiresAt: new Date(NOW.getTime() + DAY),
        menu: { id: 'm1', ownerId: 'u1' },
      });
      await service.update(owner, 'm1', { revision: 3, slug: 'viejo' }, NOW);
      const data = repo.update.mock.calls[0]?.[2] as { slugChangedAt: { set: Date[] } };
      expect(data.slugChangedAt.set).toEqual([NOW]);
      expect(repo.update.mock.calls[0]?.[3]).toMatchObject({ claim: 'viejo' });
    });

    it('does not touch the redirects when the slug stays', async () => {
      await service.update(owner, 'm1', { revision: 3, slug: 'bar-pepe', title: 'Nueva' }, NOW);
      expect(repo.update.mock.calls[0]?.[3]).toEqual({});
      expect(repo.update.mock.calls[0]?.[2]).not.toHaveProperty('slugChangedAt');
    });

    it('refuses turning a suspended, paused menu on, and renaming a suspended one (403)', async () => {
      repo.findById.mockResolvedValue(
        menu({ enabled: false, suspendedAt: NOW, suspendedReason: 'spam' }),
      );
      await expect(
        service.update(owner, 'm1', { revision: 3, enabled: true }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.update(owner, 'm1', { revision: 3, slug: 'otro-bar' }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('lets a suspended menu save its settings, also with enabled: true as the editor sends it', async () => {
      repo.findById.mockResolvedValue(menu({ suspendedAt: NOW, suspendedReason: 'spam' }));
      // Already enabled: sending enabled: true is not a change.
      await service.update(owner, 'm1', { revision: 3, title: 'Nueva', enabled: true }, NOW);
      expect(repo.update).toHaveBeenCalledTimes(1);
      await service.update(owner, 'm1', { revision: 3, title: 'Otra', enabled: false }, NOW);
      expect(repo.update).toHaveBeenCalledTimes(2);
    });

    it('saves settings and content together, in one write with one revision', async () => {
      const saved = await service.update(
        owner,
        'm1',
        {
          revision: 3,
          title: 'Nueva',
          slug: 'bar-nuevo',
          content: { categories: [{ name: 'Postres', items: [{ name: 'Flan' }] }] },
        },
        NOW,
      );
      expect(repo.update).toHaveBeenCalledTimes(1);
      const [, revision, data, move] = repo.update.mock.calls[0] ?? [];
      expect(revision).toBe(3);
      expect(data).toMatchObject({ title: 'Nueva', slug: 'bar-nuevo' });
      expect((data as { content: typeof content }).content.categories[0]?.name).toBe('Postres');
      expect(move).toMatchObject({ claim: 'bar-nuevo' });
      expect(saved.revision).toBe(4);
    });

    it('validates settings and content together: nothing is written on any error (422)', async () => {
      const error = await service
        .update(
          owner,
          'm1',
          {
            revision: 3,
            slug: 'bar-nuevo',
            note: 'Mira www.bar.com',
            content: { categories: [{ name: 'A', items: [{ name: 'http://x.com' }] }] },
          },
          NOW,
        )
        .catch((e) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.getResponse().errors.map((e: { path: string }) => e.path)).toEqual([
        'note',
        'content.categories.0.items.0.name',
      ]);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('checks the content against the kind it is saved with', async () => {
      const allergens = {
        categories: [{ name: 'A', items: [{ name: 'x', allergens: ['milk'] }] }],
      };
      await expect(
        service.update(owner, 'm1', { revision: 3, kind: 'CATALOGUE', content: allergens }, NOW),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      await service.update(owner, 'm1', { revision: 3, content: allergens }, NOW);
      expect(repo.update).toHaveBeenCalledTimes(1);
    });

    it('takes the allergens out when a menu becomes a catalogue', async () => {
      await service.update(owner, 'm1', { revision: 3, kind: 'CATALOGUE' }, NOW);
      const data = repo.update.mock.calls[0]?.[2] as { content: typeof content };
      expect(data.content.categories[0]?.items[0]).toEqual({ key: 'it000001', name: 'Croquetas' });
    });

    it('refuses a link in a text with 422', async () => {
      await expect(
        service.update(owner, 'm1', { revision: 3, note: 'https://x.com' }, NOW),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('content and quick changes', () => {
    it('saves the validated content with the revision it was read at', async () => {
      const saved = await service.putContent(
        owner,
        'm1',
        {
          revision: 3,
          content: { categories: [{ name: 'A', items: [{ name: 'Flan', price: '4' }] }] },
        },
        NOW,
      );
      expect(saved.revision).toBe(4);
      expect(repo.update.mock.calls[0]?.[1]).toBe(3);
    });

    it('answers 422 for invalid content and 409 for a stale revision', async () => {
      await expect(
        service.putContent(owner, 'm1', { revision: 3, content: { categories: [] } }, NOW),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(
        service.putContent(
          owner,
          'm1',
          { revision: 1, content: { categories: [{ name: 'A', items: [] }] } },
          NOW,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('changes one item and answers the new revision, without asking for one', async () => {
      const result = await service.setItemFlags(owner, 'm1', 'it000001', { soldOut: true }, NOW);
      expect(result).toEqual({ revision: 4 });
      const data = repo.update.mock.calls[0]?.[2] as { content: typeof content };
      expect(data.content.categories[0]?.items[0]).toMatchObject({
        key: 'it000001',
        soldOut: true,
      });
    });

    it('answers 404 for an unknown key and retries when another save lands in between', async () => {
      await expect(
        service.setItemFlags(owner, 'm1', 'nope0000', { hidden: true }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      repo.update.mockResolvedValueOnce(null);
      const result = await service.setItemFlags(owner, 'm1', 'it000001', { hidden: true }, NOW);
      expect(result.revision).toBe(4);
      expect(repo.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('slug check', () => {
    it('says invalid, reserved, taken or available', async () => {
      expect(await service.slugCheck(owner, 'AB', undefined, NOW)).toEqual({
        available: false,
        reason: 'invalid',
      });
      expect(await service.slugCheck(owner, 'editar', undefined, NOW)).toEqual({
        available: false,
        reason: 'reserved',
      });
      repo.findBySlug.mockResolvedValueOnce(menu({ id: 'other' }));
      expect(await service.slugCheck(owner, 'bar-pepe', undefined, NOW)).toEqual({
        available: false,
        reason: 'taken',
      });
      expect(await service.slugCheck(owner, ' Bar-Libre ', undefined, NOW)).toEqual({
        available: true,
      });
    });

    it('does not count the menu being edited as taking its own slug', async () => {
      repo.findBySlug.mockResolvedValue(menu());
      expect(await service.slugCheck(owner, 'bar-pepe', 'm1', NOW)).toEqual({ available: true });
      // A menu id that is not mine is ignored.
      repo.findById.mockResolvedValue(menu({ ownerId: 'someone-else' }));
      expect(await service.slugCheck(owner, 'bar-pepe', 'm1', NOW)).toEqual({
        available: false,
        reason: 'taken',
      });
    });
  });

  describe('the public page', () => {
    it('shows a live menu without hidden items, with the badge, and no owner data', async () => {
      repo.findBySlug.mockResolvedValue(menu());
      const found = await service.publicLookup('bar-pepe', NOW);
      expect(found).toMatchObject({
        found: 'menu',
        menu: { slug: 'bar-pepe', showBadge: true, indexable: true },
      });
      if (found.found !== 'menu') return;
      expect(found.menu.content.categories[0]?.items).toEqual([
        { key: 'it000001', name: 'Croquetas', allergens: ['milk'] },
      ]);
      expect(found.menu).not.toHaveProperty('ownerId');
      expect(found.menu).not.toHaveProperty('revision');
    });

    it('answers the same 404 for a missing, paused and suspended menu', async () => {
      const messages = new Set<string>();
      for (const row of [null, menu({ enabled: false }), menu({ suspendedAt: NOW })]) {
        repo.findBySlug.mockResolvedValue(row);
        const error = await service.publicLookup('bar-pepe', NOW).catch((e) => e);
        expect(error).toBeInstanceOf(NotFoundException);
        messages.add(error.message);
      }
      expect([...messages]).toEqual(['This menu is not available']);
    });

    it('redirects an old slug to the current one while it works', async () => {
      repo.findRedirect.mockResolvedValue({
        slug: 'viejo',
        menuId: 'm1',
        expiresAt: new Date(NOW.getTime() + DAY),
        menu: { id: 'm1', ownerId: 'u1' },
      });
      expect(await service.publicLookup('viejo', NOW)).toEqual({
        found: 'redirect',
        slug: 'bar-pepe',
      });
    });

    it('does not redirect once expired, nor to a menu that is not available', async () => {
      const redirect = (expiresAt: Date) => ({
        slug: 'viejo',
        menuId: 'm1',
        expiresAt,
        menu: { id: 'm1', ownerId: 'u1' },
      });
      repo.findRedirect.mockResolvedValue(redirect(new Date(NOW.getTime() - 1)));
      await expect(service.publicLookup('viejo', NOW)).rejects.toBeInstanceOf(NotFoundException);
      repo.findRedirect.mockResolvedValue(redirect(new Date(NOW.getTime() + DAY)));
      repo.findById.mockResolvedValue(menu({ suspendedAt: NOW }));
      await expect(service.publicLookup('viejo', NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists the sitemap entries', async () => {
      repo.sitemap.mockResolvedValue([{ slug: 'bar-pepe', language: 'ES', updatedAt: NOW }]);
      expect(await service.sitemap()).toEqual({
        items: [{ slug: 'bar-pepe', language: 'ES', updatedAt: NOW.toISOString() }],
      });
    });
  });

  describe('reports', () => {
    const report = {
      slug: 'bar-pepe',
      reason: 'SPAM',
      details: 'It is a spam page',
      email: 'Ana@X.test',
    } as never;

    it('stores it with a copy of the slug and name, and emails the team inbox', async () => {
      repo.findBySlug.mockResolvedValue(menu());
      await service.report(report, '1.1.1.1');
      expect(repo.createReport).toHaveBeenCalledWith({
        menuId: 'm1',
        slug: 'bar-pepe',
        businessName: 'Bar Pepe',
        reason: 'SPAM',
        details: 'It is a spam page',
        email: 'ana@x.test',
      });
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'hello@codeqlick.com',
          subject: 'Menu report (SPAM): bar-pepe',
        }),
      );
    });

    it('does nothing for a filled honeypot', async () => {
      await service.report({ ...(report as object), website: 'http://spam' } as never, '1.1.1.1');
      expect(repo.createReport).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown menu', async () => {
      await expect(service.report(report, '1.1.1.1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('takes 10 reports a day from one address, then 429', async () => {
      repo.findBySlug.mockResolvedValue(menu());
      for (let i = 0; i < 10; i += 1) await service.report(report, '2.2.2.2');
      const error = await service.report(report, '2.2.2.2').catch((e) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(429);
      await service.report(report, '3.3.3.3');
    });

    it('still answers when the team email fails', async () => {
      repo.findBySlug.mockResolvedValue(menu());
      mail.send.mockRejectedValue(new Error('smtp down'));
      await expect(service.report(report, '4.4.4.4')).resolves.toBeUndefined();
      expect(repo.createReport).toHaveBeenCalled();
    });
  });
});

describe('MenusAdminService', () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let activity: { record: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: MenusAdminService;
  const config = {
    webappUrl: () => 'https://menu.codeqlick.com',
    siteUrl: 'https://codeqlick.com',
  };
  const withOwner = (over: Partial<Menu> = {}) => ({
    ...menu(over),
    owner: { id: 'u1', name: 'Pepe', email: 'pepe@x.test', locale: 'ES' },
  });

  beforeEach(() => {
    repo = {
      findWithOwner: vi.fn().mockResolvedValue(withOwner()),
      findById: vi.fn().mockResolvedValue(menu({ suspendedAt: NOW })),
      setSuspension: vi.fn().mockResolvedValue(undefined),
      closeReport: vi.fn().mockResolvedValue(true),
    };
    activity = { record: vi.fn().mockResolvedValue(undefined) };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    service = new MenusAdminService(
      repo as never,
      activity as never,
      mail as never,
      config as never,
    );
  });

  it('suspends, logs it and emails the owner the reason in their language', async () => {
    await service.suspend(admin, 'm1', 'Spam page', NOW);
    expect(repo.setSuspension).toHaveBeenCalledWith('m1', NOW, 'Spam page');
    expect(activity.record).toHaveBeenCalledWith(admin, {
      action: 'menu.suspend',
      targetId: 'm1',
      targetLabel: 'bar-pepe',
      details: { reason: 'Spam page' },
    });
    const email = mail.send.mock.calls[0]?.[0];
    expect(email.to).toBe('pepe@x.test');
    expect(email.subject).toContain('Hemos suspendido');
    expect(email.text).toContain('Spam page');
    expect(email.html).toContain('Spam page');
  });

  it('answers 409 for a menu already suspended and 404 for an unknown one', async () => {
    repo.findWithOwner.mockResolvedValue(withOwner({ suspendedAt: NOW }));
    await expect(service.suspend(admin, 'm1', 'Spam page')).rejects.toBeInstanceOf(
      ConflictException,
    );
    repo.findWithOwner.mockResolvedValue(null);
    await expect(service.suspend(admin, 'm1', 'Spam page')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lifts a suspension and logs it', async () => {
    await service.unsuspend(admin, 'm1');
    expect(repo.setSuspension).toHaveBeenCalledWith('m1', null, null);
    expect(activity.record).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'menu.unsuspend' }),
    );
    repo.findById.mockResolvedValue(menu());
    await expect(service.unsuspend(admin, 'm1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('closes a report with a note and logs it; 404 when it is closed already', async () => {
    await service.closeReport(admin, 'r1', 'Checked: fine');
    expect(repo.closeReport).toHaveBeenCalledWith('r1', 'Checked: fine', expect.any(Date));
    expect(activity.record).toHaveBeenCalledWith(admin, {
      action: 'menu.report_close',
      targetId: 'r1',
      details: { note: 'Checked: fine' },
    });
    repo.closeReport.mockResolvedValue(false);
    await expect(service.closeReport(admin, 'r1', undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
