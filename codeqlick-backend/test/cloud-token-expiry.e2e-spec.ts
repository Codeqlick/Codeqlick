import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { CloudTokensService } from '../src/modules/cloud/cloud-tokens.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const DAY = 86_400_000;
const ada = `e2e-te-ada-${tag}@codeqlick.test`;
const gone = `e2e-te-gone-${tag}@codeqlick.test`;

describe('Codeqlick Cloud token expiry emails (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const mine = () => sent.filter((m) => m.to === ada || m.to === gone);

  const token = async (
    userId: string,
    name: string,
    expiresAt: Date,
    lastUsedAt: Date | null,
    createdAt = new Date(Date.now() - 60 * DAY),
  ) =>
    prisma.cloudToken.create({
      data: {
        userId,
        name,
        prefix: 'cqk_e2eexpir',
        tokenHash: createHash('sha256').update(randomBytes(16)).digest('hex'),
        expiresAt,
        lastUsedAt,
        createdAt,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    await app?.close();
  });

  it('warns once, skips unused and deactivated, and announces expired ones before deleting', async () => {
    const service = app.get(CloudTokensService);
    const registeredAt = new Date();
    const user = await prisma.user.create({
      data: { email: ada, name: 'Ada', role: Role.CLIENT, registeredAt, passwordHash: 'x' },
    });
    const away = await prisma.user.create({
      data: {
        email: gone,
        name: 'Gone',
        role: Role.CLIENT,
        registeredAt,
        passwordHash: 'x',
        isActive: false,
      },
    });
    const now = new Date();
    const soon = await token(user.id, 'CI deploy', new Date(now.getTime() + 3 * DAY), now);
    await token(user.id, 'Forgotten', new Date(now.getTime() + 3 * DAY), null);
    await token(user.id, 'Fresh', new Date(now.getTime() + 3 * DAY), null, now);
    await token(user.id, 'Far away', new Date(now.getTime() + 20 * DAY), now);
    await token(away.id, 'Deactivated', new Date(now.getTime() + 3 * DAY), now);

    await service.cleanup(now);
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({
      to: ada,
      subject: '2 of your Codeqlick Cloud tokens expire soon',
    });
    expect(mine()[0]!.text).toContain('CI deploy');
    expect(mine()[0]!.text).toContain('Fresh');
    expect(mine()[0]!.text).not.toContain('Forgotten');
    expect(
      (await prisma.cloudToken.findUniqueOrThrow({ where: { id: soon.id } })).expiryWarnedAt,
    ).not.toBeNull();

    // Never twice.
    await service.cleanup(new Date(now.getTime() + 60_000));
    expect(mine()).toHaveLength(1);

    // Four days later "CI deploy" (used within the week) and "Forgotten" (never used) have
    // expired: only the first is announced, both are deleted.
    sent.length = 0;
    const later = new Date(now.getTime() + 4 * DAY);
    await service.cleanup(later);
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({
      to: ada,
      subject: 'Your Codeqlick Cloud token has expired',
    });
    expect(mine()[0]!.text).toContain('CI deploy');
    expect(mine()[0]!.text).not.toContain('Forgotten');
    const left = await prisma.cloudToken.findMany({ where: { userId: user.id } });
    expect(left.map((t) => t.name)).toEqual(['Far away']);
  });

  it('keeps a warning retryable and still deletes when an email fails', async () => {
    const service = app.get(CloudTokensService);
    const user = await prisma.user.create({
      data: {
        email: `e2e-te-fail-${tag}@codeqlick.test`,
        name: 'Fail',
        role: Role.CLIENT,
        registeredAt: new Date(),
        passwordHash: 'x',
      },
    });
    const now = new Date();
    const soon = await token(user.id, 'Soon', new Date(now.getTime() + 3 * DAY), now);
    const send = vi.spyOn(app.get(MailService), 'send');

    send.mockRejectedValueOnce(new Error('smtp down'));
    await service.cleanup(now);
    expect(
      (await prisma.cloudToken.findUniqueOrThrow({ where: { id: soon.id } })).expiryWarnedAt,
    ).toBeNull();
    // The next run retries it.
    sent.length = 0;
    await service.cleanup(new Date(now.getTime() + 60_000));
    expect(sent.filter((m) => m.to === user.email)).toHaveLength(1);
    expect(
      (await prisma.cloudToken.findUniqueOrThrow({ where: { id: soon.id } })).expiryWarnedAt,
    ).not.toBeNull();

    // An expired, recently used token is deleted even when its email fails.
    send.mockRejectedValueOnce(new Error('smtp down'));
    await service.cleanup(new Date(now.getTime() + 4 * DAY));
    expect(await prisma.cloudToken.count({ where: { userId: user.id } })).toBe(0);
  });
});
