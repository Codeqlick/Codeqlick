import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { NewsletterSubscriber } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { NewsletterPost, NewsletterRepository } from './newsletter.repository.js';
import type { SubscribeInput } from './newsletter.schemas.js';
import {
  CONFIRM_RESEND_MINUTES,
  hashConfirmToken,
  NewsletterService,
  PENDING_RETENTION_DAYS,
  POSTS_PER_RUN,
  UNSUBSCRIBED_RETENTION_DAYS,
} from './newsletter.service.js';

const now = new Date('2026-11-14T12:00:00Z');
const MINUTE = 60_000;

const input: SubscribeInput = {
  email: 'Ada@Example.com',
  locale: 'es',
  acceptPrivacy: true,
};

function subscriber(extra: Partial<NewsletterSubscriber> = {}): NewsletterSubscriber {
  return {
    id: 's1',
    email: 'ada@example.com',
    locale: 'ES',
    status: 'PENDING',
    confirmTokenHash: null,
    confirmExpiresAt: null,
    confirmSentAt: null,
    confirmedAt: null,
    unsubscribeToken: 'unsub-token-s1',
    unsubscribedAt: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...extra,
  };
}

function post(slug: string, extra: Partial<NewsletterPost> = {}): NewsletterPost {
  return {
    id: `p-${slug}`,
    slug,
    status: 'PUBLISHED',
    publishedAt: new Date('2026-11-14T11:00:00Z'),
    newsletter: true,
    newsletterSentAt: null,
    translations: [
      {
        id: `t-en-${slug}`,
        postId: `p-${slug}`,
        locale: 'EN',
        title: `EN ${slug}`,
        excerpt: `Excerpt ${slug}`,
        content: 'x',
      },
      {
        id: `t-es-${slug}`,
        postId: `p-${slug}`,
        locale: 'ES',
        title: `ES ${slug}`,
        excerpt: `Extracto ${slug}`,
        content: 'x',
      },
    ],
    ...extra,
  } as unknown as NewsletterPost;
}

const admin = { id: 'a1', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' } as AuthUser;

describe('NewsletterService', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let mail: { send: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let service: NewsletterService;

  beforeEach(() => {
    repository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByConfirmHash: vi.fn().mockResolvedValue(null),
      findByUnsubscribeToken: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(subscriber()),
      update: vi
        .fn()
        .mockImplementation((_id: string, data: object) =>
          Promise.resolve(subscriber({ ...data } as Partial<NewsletterSubscriber>)),
        ),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      counts: vi.fn().mockResolvedValue({ active: 0, pending: 0, unsubscribed: 0 }),
      listActive: vi.fn().mockResolvedValue([]),
      deletePendingExpiredBefore: vi.fn().mockResolvedValue(0),
      findPostsToSend: vi.fn().mockResolvedValue([]),
      claimPost: vi.fn().mockResolvedValue(true),
      deleteUnsubscribedBefore: vi.fn().mockResolvedValue(0),
    };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    activity = { record: vi.fn().mockResolvedValue(undefined) };
    const config = {
      siteUrl: 'https://codeqlick.com',
      publicApiUrl: 'https://api.codeqlick.com/v1',
      isTest: true,
    } as AppConfigService;
    service = new NewsletterService(
      repository as unknown as NewsletterRepository,
      mail as unknown as MailService,
      config,
      activity as unknown as ActivityService,
    );
  });

  describe('subscribe', () => {
    it('creates a new address as PENDING and emails the confirmation link', async () => {
      await service.subscribe(input, now);

      const created = repository.create!.mock.calls[0]![0] as Record<string, unknown>;
      expect(created).toMatchObject({
        email: 'ada@example.com',
        locale: 'ES',
        status: 'PENDING',
        confirmSentAt: now,
        confirmExpiresAt: new Date(now.getTime() + 48 * 60 * MINUTE),
      });
      expect(created.unsubscribeToken).toMatch(/^[\w-]{43}$/);
      expect(mail.send).toHaveBeenCalledTimes(1);
      const message = mail.send.mock.calls[0]![0] as { to: string; text: string; headers?: object };
      expect(message.to).toBe('ada@example.com');
      const token = /https:\/\/codeqlick\.com\/es\/newsletter\/confirm\?token=([\w-]+)/.exec(
        message.text,
      )?.[1];
      expect(token).toBeDefined();
      // Only the hash is stored.
      expect(created.confirmTokenHash).toBe(hashConfirmToken(token!));
      expect(created.confirmTokenHash).not.toBe(token);
      expect(message.headers).toBeUndefined();
    });

    it('sends nothing and stores nothing for an ACTIVE address', async () => {
      repository.findByEmail!.mockResolvedValue(subscriber({ status: 'ACTIVE' }));

      await service.subscribe(input, now);

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('gives a PENDING address a new token and email', async () => {
      repository.findByEmail!.mockResolvedValue(
        subscriber({ confirmSentAt: new Date(now.getTime() - 11 * MINUTE) }),
      );

      await service.subscribe(input, now);

      expect(repository.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ status: 'PENDING', confirmSentAt: now }),
      );
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('never reactivates an UNSUBSCRIBED address without a new confirmation', async () => {
      repository.findByEmail!.mockResolvedValue(
        subscriber({ status: 'UNSUBSCRIBED', unsubscribedAt: new Date('2026-11-02T00:00:00Z') }),
      );

      await service.subscribe(input, now);

      const data = repository.update!.mock.calls[0]![1] as Record<string, unknown>;
      expect(data.status).toBe('PENDING');
      expect(data.confirmTokenHash).toEqual(expect.any(String));
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('sends at most one confirmation every 10 minutes per address', async () => {
      repository.findByEmail!.mockResolvedValue(
        subscriber({
          confirmSentAt: new Date(now.getTime() - (CONFIRM_RESEND_MINUTES - 1) * MINUTE),
        }),
      );

      await service.subscribe(input, now);

      expect(repository.update).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('does nothing for a filled honeypot', async () => {
      await service.subscribe({ ...input, website: 'http://spam.example' }, now);

      expect(repository.findByEmail).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('refuses a disposable address with the field error', async () => {
      const error = await service
        .subscribe({ ...input, email: 'bot@mailinator.com' }, now)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        errors: [{ path: 'email', message: 'disposable' }],
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('still answers when the confirmation email fails', async () => {
      mail.send.mockRejectedValue(new Error('smtp down'));

      await expect(service.subscribe(input, now)).resolves.toBeUndefined();
    });

    it('tolerates a concurrent sign-up of the same address', async () => {
      repository.create!.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(service.subscribe(input, now)).resolves.toBeUndefined();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('activates the subscriber and clears the token', async () => {
      repository.findByConfirmHash!.mockResolvedValue(
        subscriber({
          confirmTokenHash: hashConfirmToken('abc'),
          confirmExpiresAt: new Date(now.getTime() + MINUTE),
        }),
      );

      const result = await service.confirm('abc', now);

      expect(repository.findByConfirmHash).toHaveBeenCalledWith(hashConfirmToken('abc'));
      expect(repository.update).toHaveBeenCalledWith('s1', {
        status: 'ACTIVE',
        confirmedAt: now,
        unsubscribedAt: null,
        confirmTokenHash: null,
        confirmExpiresAt: null,
      });
      expect(result).toEqual({ email: 'ada@example.com', locale: 'es' });
    });

    it('rejects an expired token', async () => {
      repository.findByConfirmHash!.mockResolvedValue(
        subscriber({ confirmExpiresAt: new Date(now.getTime() - MINUTE) }),
      );

      await expect(service.confirm('abc', now)).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      await expect(service.confirm('nope', now)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unsubscribe', () => {
    it('unsubscribes and keeps the row', async () => {
      repository.findByUnsubscribeToken!.mockResolvedValue(subscriber({ status: 'ACTIVE' }));

      const result = await service.unsubscribe('unsub-token-s1', now);

      expect(repository.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ status: 'UNSUBSCRIBED', unsubscribedAt: now }),
      );
      expect(repository.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ email: 'ada@example.com' });
    });

    it('is idempotent', async () => {
      repository.findByUnsubscribeToken!.mockResolvedValue(
        subscriber({ status: 'UNSUBSCRIBED', unsubscribedAt: new Date('2026-11-02T00:00:00Z') }),
      );

      await expect(service.unsubscribe('unsub-token-s1', now)).resolves.toEqual({
        email: 'ada@example.com',
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('builds the unsubscribe page link without changing anything', async () => {
      repository.findByUnsubscribeToken!.mockResolvedValue(subscriber());

      await expect(service.unsubscribePageUrl('unsub-token-s1')).resolves.toBe(
        'https://codeqlick.com/es/newsletter/unsubscribe?token=unsub-token-s1',
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('sends an unknown token to the English page, revealing nothing', async () => {
      await expect(service.unsubscribePageUrl('nope')).resolves.toBe(
        'https://codeqlick.com/en/newsletter/unsubscribe?token=nope',
      );
    });

    it('answers NotFound for an unknown token', async () => {
      await expect(service.unsubscribe('nope', now)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('admin', () => {
    it('lists with the counts of all subscribers', async () => {
      repository.list!.mockResolvedValue({
        items: [subscriber({ status: 'ACTIVE', confirmedAt: now })],
        total: 41,
      });
      repository.counts!.mockResolvedValue({ active: 30, pending: 8, unsubscribed: 3 });

      const result = await service.list({ page: 2, pageSize: 20, status: 'ACTIVE', q: 'ada' });

      expect(repository.list).toHaveBeenCalledWith({ status: 'ACTIVE', q: 'ada' }, 20, 20);
      expect(result).toEqual({
        items: [
          {
            id: 's1',
            email: 'ada@example.com',
            locale: 'es',
            status: 'ACTIVE',
            createdAt: '2026-11-01T00:00:00.000Z',
            confirmedAt: now.toISOString(),
            unsubscribedAt: null,
          },
        ],
        page: 2,
        pageSize: 20,
        total: 41,
        totalPages: 3,
        counts: { active: 30, pending: 8, unsubscribed: 3 },
      });
    });

    it('deletes a subscriber and records it', async () => {
      repository.findById!.mockResolvedValue(subscriber());

      await service.delete(admin, 's1');

      expect(repository.delete).toHaveBeenCalledWith('s1');
      expect(activity.record).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({
          action: 'newsletter.subscriber_deleted',
          targetId: 's1',
          targetLabel: null,
        }),
      );
    });

    it('answers NotFound when deleting an unknown subscriber', async () => {
      await expect(service.delete(admin, 'missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(activity.record).not.toHaveBeenCalled();
    });
  });

  describe('sendNewPosts', () => {
    const english = subscriber({
      id: 's-en',
      email: 'en@example.com',
      locale: 'EN',
      status: 'ACTIVE',
    });
    const spanish = subscriber({
      id: 's-es',
      email: 'es@example.com',
      locale: 'ES',
      status: 'ACTIVE',
    });

    it('asks for live posts not yet sent, at most 3', async () => {
      await service.sendNewPosts(now);

      expect(repository.findPostsToSend).toHaveBeenCalledWith(now, POSTS_PER_RUN);
      expect(POSTS_PER_RUN).toBe(3);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('marks the post as sent before emailing anyone', async () => {
      const order: string[] = [];
      repository.findPostsToSend!.mockResolvedValue([post('hello')]);
      repository.listActive!.mockResolvedValue([english]);
      repository.claimPost!.mockImplementation(() => {
        order.push('mark');
        return Promise.resolve(true);
      });
      mail.send.mockImplementation(() => {
        order.push('send');
        return Promise.resolve();
      });

      await service.sendNewPosts(now);

      expect(order).toEqual(['mark', 'send']);
      expect(repository.claimPost).toHaveBeenCalledWith('p-hello', now);
    });

    it('marks a post with newsletter off as sent without emailing', async () => {
      repository.findPostsToSend!.mockResolvedValue([post('quiet', { newsletter: false })]);
      repository.listActive!.mockResolvedValue([english]);

      await service.sendNewPosts(now);

      expect(repository.claimPost).toHaveBeenCalledWith('p-quiet', now);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('emails each subscriber in their language with the unsubscribe headers', async () => {
      repository.findPostsToSend!.mockResolvedValue([post('hello')]);
      repository.listActive!.mockResolvedValue([english, spanish]);

      await service.sendNewPosts(now);

      expect(mail.send).toHaveBeenCalledTimes(2);
      const [enMessage, esMessage] = mail.send.mock.calls.map(
        (call) =>
          call[0] as {
            to: string;
            subject: string;
            text: string;
            html: string;
            headers: Record<string, string>;
          },
      );
      expect(enMessage).toMatchObject({ to: 'en@example.com', subject: 'EN hello' });
      expect(enMessage!.text).toContain('Excerpt hello');
      expect(enMessage!.text).toContain('https://codeqlick.com/en/blog/hello');
      expect(esMessage).toMatchObject({ to: 'es@example.com', subject: 'ES hello' });
      expect(esMessage!.text).toContain('https://codeqlick.com/es/blog/hello');
      expect(esMessage!.text).toContain(
        'https://codeqlick.com/es/newsletter/unsubscribe?token=unsub-token-s1',
      );
      expect(esMessage!.headers).toEqual({
        'List-Unsubscribe': '<https://api.codeqlick.com/v1/newsletter/unsubscribe/unsub-token-s1>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
    });

    it("falls back to English when the post has no translation in the subscriber's language", async () => {
      const onlyEnglish = post('hello');
      onlyEnglish.translations = onlyEnglish.translations.filter((t) => t.locale === 'EN');
      repository.findPostsToSend!.mockResolvedValue([onlyEnglish]);
      repository.listActive!.mockResolvedValue([spanish]);

      await service.sendNewPosts(now);

      const message = mail.send.mock.calls[0]![0] as { subject: string; text: string };
      expect(message.subject).toBe('EN hello');
      // The link keeps the subscriber's language: the site falls back by itself.
      expect(message.text).toContain('https://codeqlick.com/es/blog/hello');
    });

    it('does not stop at a failed send', async () => {
      repository.findPostsToSend!.mockResolvedValue([post('hello')]);
      repository.listActive!.mockResolvedValue([english, spanish]);
      mail.send.mockRejectedValueOnce(new Error('mailbox full')).mockResolvedValue(undefined);

      await expect(service.sendNewPosts(now)).resolves.toBeUndefined();

      expect(mail.send).toHaveBeenCalledTimes(2);
      // Never retried: nothing is marked again or sent twice.
      expect(repository.claimPost).toHaveBeenCalledTimes(1);
    });

    it('skips a post it could not mark as sent, and goes on with the next', async () => {
      repository.findPostsToSend!.mockResolvedValue([post('one'), post('two')]);
      repository.listActive!.mockResolvedValue([english]);
      repository.claimPost!.mockRejectedValueOnce(new Error('db')).mockResolvedValue(true);

      await service.sendNewPosts(now);

      expect(mail.send).toHaveBeenCalledTimes(1);
      expect((mail.send.mock.calls[0]![0] as { subject: string }).subject).toBe('EN two');
    });

    it('skips a post another process already claimed', async () => {
      repository.findPostsToSend!.mockResolvedValue([post('hello')]);
      repository.claimPost!.mockResolvedValue(false);

      await service.sendNewPosts(now);

      expect(repository.listActive).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('reloads the active subscribers for each post', async () => {
      repository.findPostsToSend!.mockResolvedValue([post('one'), post('two')]);
      repository
        .listActive!.mockResolvedValueOnce([english, spanish])
        .mockResolvedValueOnce([english]);

      await service.sendNewPosts(now);

      expect(repository.listActive).toHaveBeenCalledTimes(2);
      expect(mail.send).toHaveBeenCalledTimes(3);
    });

    it('never throws', async () => {
      repository.findPostsToSend!.mockRejectedValue(new Error('database down'));

      await expect(service.sendNewPosts(now)).resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('deletes PENDING sign-ups that expired more than 7 days ago', async () => {
      repository.deletePendingExpiredBefore!.mockResolvedValue(2);

      await service.cleanup(now);

      const before = repository.deletePendingExpiredBefore!.mock.calls[0]![0] as Date;
      expect(now.getTime() - before.getTime()).toBe(PENDING_RETENTION_DAYS * 86_400_000);
    });

    it('deletes sign-ups unsubscribed for more than 12 months', async () => {
      await service.cleanup(now);

      const before = repository.deleteUnsubscribedBefore!.mock.calls[0]![0] as Date;
      expect(now.getTime() - before.getTime()).toBe(UNSUBSCRIBED_RETENTION_DAYS * 86_400_000);
    });

    it('never throws', async () => {
      repository.deletePendingExpiredBefore!.mockRejectedValue(new Error('database down'));

      await expect(service.cleanup(now)).resolves.toBeUndefined();
    });
  });

  it('schedules nothing in tests', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    service.onApplicationBootstrap();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
