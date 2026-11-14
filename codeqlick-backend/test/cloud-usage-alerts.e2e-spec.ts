import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { CloudUsageAlertsService } from '../src/modules/cloud/cloud-usage-alerts.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-usage-password-1';
const owner = { email: `e2e-cu-owner-${tag}@codeqlick.test`, password };
const coOwner = { email: `e2e-cu-co-${tag}@codeqlick.test`, password };
const admin = { email: `e2e-cu-admin-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };

describe('Codeqlick Cloud usage alerts (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let alerts: CloudUsageAlertsService;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};

  /** The mail this file's people received. */
  const mine = (): MailMessage[] => sent.filter((message) => message.to.includes(`-${tag}@`));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    alerts = app.get(CloudUsageAlertsService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    for (const [name, person] of [
      ['owner', owner],
      ['coOwner', coOwner],
      ['admin', admin],
    ] as const) {
      ids[name] = (
        await prisma.user.create({
          data: { email: person.email, name, role: Role.CLIENT, passwordHash, registeredAt },
        })
      ).id;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { in: [`ua-${tag}`, `ub-${tag}`] } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  async function addBuilds(projectId: string, from: number, count: number): Promise<void> {
    await prisma.cloudBuild.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        projectId,
        number: from + index,
        trigger: 'MANUAL' as const,
        target: 'PREVIEW' as const,
        branch: 'main',
        commit: 'a'.repeat(40),
        status: 'SUCCEEDED' as const,
      })),
    });
  }

  it('shows the meters, alerts the owners once at 80 %, and stays quiet below it', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const create = async (slug: string) => {
      await request(server)
        .post('/v1/cloud/teams')
        .set(auth)
        .send({ name: `Team ${slug}`, slug, ...terms })
        .expect(201);
      const project = await request(server)
        .post(`/v1/cloud/teams/${slug}/projects`)
        .set(auth)
        .send({ name: 'Site', slug: `p-${slug}` })
        .expect(201);
      return project.body.id as string;
    };
    const busyProject = await create(`ua-${tag}`);
    const quietProject = await create(`ub-${tag}`);
    const busy = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: `ua-${tag}` } });
    const quiet = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: `ub-${tag}` } });
    const later = new Date();
    await prisma.cloudMember.createMany({
      data: [
        { teamId: busy.id, userId: ids.coOwner, role: 'OWNER' as const },
        { teamId: busy.id, userId: ids.admin, role: 'ADMIN' as const },
      ].map((member) => ({
        ...member,
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: later,
      })),
    });

    // The FREE plan allows 200 builds a month: 160 is 80 %, 10 is 5 %.
    await addBuilds(busyProject, 1, 160);
    await addBuilds(quietProject, 1, 10);

    const usage = await request(server)
      .get('/v1/cloud/teams/ua-' + tag + '/usage')
      .set(auth)
      .expect(200);
    expect(usage.body.meters).toHaveLength(5);
    expect(usage.body.meters.find((m: { key: string }) => m.key === 'builds')).toEqual({
      key: 'builds',
      used: 160,
      limit: 200,
      percent: 80,
    });
    expect(
      usage.body.meters.every((m: { key: string; percent: number }) =>
        m.key === 'builds' ? true : m.percent === 0,
      ),
    ).toBe(true);

    // One email per owner (not the admin), one row and one event; the quiet team hears nothing.
    expect(await alerts.sweep(new Date())).toBeGreaterThanOrEqual(1);
    const mail = mine();
    expect(mail.map((message) => message.to).sort()).toEqual([coOwner.email, owner.email].sort());
    expect(mail[0]?.subject).toContain('80 %');
    expect(mail[0]?.subject).toContain(`Team ua-${tag}`);
    expect(await prisma.cloudUsageAlert.count({ where: { teamId: busy.id } })).toBe(1);
    expect(
      await prisma.cloudEvent.count({ where: { teamId: busy.id, action: 'usage.alert_sent' } }),
    ).toBe(1);
    expect(await prisma.cloudUsageAlert.count({ where: { teamId: quiet.id } })).toBe(0);
    expect(
      await prisma.cloudEvent.count({ where: { teamId: quiet.id, action: 'usage.alert_sent' } }),
    ).toBe(0);

    // New activity and a second sweep: the claim is already taken, so nothing more is sent.
    await addBuilds(busyProject, 161, 1);
    await alerts.sweep(new Date());
    expect(mine()).toHaveLength(2);
    expect(await prisma.cloudUsageAlert.count({ where: { teamId: busy.id } })).toBe(1);
  });
});
