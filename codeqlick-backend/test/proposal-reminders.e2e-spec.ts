import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { ProposalRemindersService } from '../src/modules/proposals/proposal-reminders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const email = `e2e-rem-${tag}@codeqlick.test`;
const DAY = 86_400_000;
const now = new Date('2026-11-10T09:00:00Z');
const day = (offset: number) => new Date(Date.UTC(2026, 10, 10 + offset));

describe('Reminder before a proposal expires (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const client = await prisma.user.create({
      data: {
        email,
        name: 'Rita',
        role: Role.CLIENT,
        locale: 'ES',
        passwordHash: 'x',
        registeredAt: new Date(),
      },
    });
    const proposal = (title: string, validUntil: Date, sentAt: Date) =>
      prisma.proposal.create({
        data: {
          clientId: client.id,
          title: `${title} ${tag}`,
          summary: 'Scope',
          status: 'SENT',
          validUntil,
          sentAt,
          items: { create: [{ description: 'Web', quantity: 1, unitPrice: 150_000, position: 0 }] },
        },
      });
    ids.soon = (await proposal('Soon', day(2), new Date(now.getTime() - 5 * DAY))).id;
    ids.later = (await proposal('Later', day(10), new Date(now.getTime() - 5 * DAY))).id;
    ids.fresh = (await proposal('Fresh', day(1), new Date(now.getTime() - 3_600_000))).id;
    ids.past = (await proposal('Past', day(-1), new Date(now.getTime() - 9 * DAY))).id;
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } });
    await app?.close();
  });

  it('reminds the client and the team once, only of proposals about to expire', async () => {
    const reminders = app.get(ProposalRemindersService);
    await reminders.runDue(now);

    const mine = sent.filter((message) => message.to === email);
    expect(mine.map((message) => message.subject)).toEqual([
      expect.stringMatching(/^Tu propuesta #\d+ vence el 12 de noviembre de 2026$/),
    ]);
    expect(mine[0]?.text).toContain(`/es/portal/proposals/${ids.soon}`);
    expect(
      sent.some((m) => m.subject.includes('expires on') && m.text.includes(`Soon ${tag}`)),
    ).toBe(true);
    const rows = await prisma.proposal.findMany({
      where: { id: { in: Object.values(ids) } },
      select: { id: true, expiryRemindedAt: true },
    });
    expect(rows.filter((row) => row.expiryRemindedAt).map((row) => row.id)).toEqual([ids.soon]);

    // Once only.
    sent.length = 0;
    await reminders.runDue(new Date(now.getTime() + 6 * 3_600_000));
    expect(sent.filter((message) => message.to === email)).toEqual([]);
  });
});
