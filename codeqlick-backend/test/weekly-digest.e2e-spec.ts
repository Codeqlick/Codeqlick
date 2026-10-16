import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { WeeklyDigestService } from '../src/modules/projects/weekly-digest.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'digest-password-1';
const admin = { email: `e2e-digest-admin-${tag}@codeqlick.test`, password };
const busy = { email: `e2e-digest-busy-${tag}@codeqlick.test`, password };
const quiet = { email: `e2e-digest-quiet-${tag}@codeqlick.test`, password };

describe('Weekly project summary (e2e)', () => {
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
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    for (const [key, user, name] of [
      ['busy', busy, 'Grace'],
      ['quiet', quiet, 'Ada'],
    ] as const) {
      ids[key] = (
        await prisma.user.create({
          data: { email: user.email, name, role: Role.CLIENT, locale: Locale.ES, passwordHash },
        })
      ).id;
    }
    const weekAgo = new Date(Date.now() - 10 * 86_400_000);
    await prisma.clientProject.create({
      data: {
        clientId: ids.busy!,
        name: 'Tienda online',
        phase: 'DEVELOPMENT',
        progress: 60,
        updates: {
          create: [
            { title: 'Catálogo listo', body: 'x' },
            { title: 'Portada', body: 'x', approvalRequested: true },
            { title: 'Antigua', body: 'x', createdAt: weekAgo },
          ],
        },
        milestones: {
          create: [
            { title: 'Diseño', position: 0, completedAt: new Date() },
            { title: 'Pagos', position: 1, dueDate: new Date('2026-12-01') },
          ],
        },
      },
    });
    // Only old activity: nothing to tell this week.
    await prisma.clientProject.create({
      data: {
        clientId: ids.quiet!,
        name: 'Web corporativa',
        phase: 'SUPPORT',
        progress: 100,
        updates: { create: [{ title: 'Lanzada', body: 'x', createdAt: weekAgo }] },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId: { in: Object.values(ids) } } });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, busy.email, quiet.email] } },
      });
    }
    await app?.close();
  });

  it('tells each client what happened this week, once, and only when there is news', async () => {
    const server = app.getHttpServer();
    const auth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };

    const now = await request(server)
      .post(`/v1/admin/projects/weekly-digest/${ids.busy}`)
      .set(auth)
      .expect(200, { sent: true });
    expect(now.body.sent).toBe(true);
    const email = sent.at(-1)!;
    expect(email).toMatchObject({ to: busy.email, subject: 'Tu resumen semanal — Codeqlick' });
    expect(email.text).toContain('Tienda online');
    expect(email.text).toContain('• Novedad: Catálogo listo');
    expect(email.text).toContain('✓ Hito completado: Diseño');
    expect(email.text).toContain('→ Pendiente de tu aprobación: Portada');
    expect(email.text).toContain('Siguiente hito: Pagos');
    expect(email.text).not.toContain('Antigua');
    await request(server)
      .post(`/v1/admin/projects/weekly-digest/${ids.quiet}`)
      .set(auth)
      .expect(200, { sent: false, reason: 'no-news' });

    // The Monday run: the client already sent to this week isn't sent to again, the quiet one gets
    // nothing, and a second run sends nothing more.
    const digest = app.get(WeeklyDigestService);
    const before = sent.length;
    await digest.runDue();
    await digest.runDue();
    const ours = sent.slice(before).filter((m) => [busy.email, quiet.email].includes(m.to));
    expect(ours).toEqual([]);
    const marked = await prisma.user.findMany({
      where: { id: { in: [ids.busy!, ids.quiet!] } },
      select: { lastDigestAt: true },
    });
    expect(marked.every((user) => user.lastDigestAt !== null)).toBe(true);
  });

  it('lets clients turn it off, and admins see and change it', async () => {
    const server = app.getHttpServer();
    const clientAuth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(quiet).expect(200)).body.accessToken as string}`,
    };
    await request(server)
      .get('/v1/auth/preferences')
      .set(clientAuth)
      .expect(200, { weeklyDigest: true, monthlyReport: true });
    await request(server)
      .patch('/v1/auth/preferences')
      .set(clientAuth)
      .send({ weeklyDigest: false })
      .expect(200, { weeklyDigest: false, monthlyReport: true });
    await request(server)
      .patch('/v1/auth/preferences')
      .set(clientAuth)
      .send({ monthlyReport: false })
      .expect(200, { weeklyDigest: false, monthlyReport: false });
    const auth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: ids.quiet! } });
    expect(stored.weeklyDigest).toBe(false);
    const updated = await request(server)
      .patch(`/v1/admin/users/${ids.quiet}`)
      .set(auth)
      .send({ weeklyDigest: true })
      .expect(200);
    expect(updated.body.weeklyDigest).toBe(true);
  });
});
