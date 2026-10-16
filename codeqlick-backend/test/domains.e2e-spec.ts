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
import { DomainsService } from '../src/modules/domains/domains.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'domain-password-1';
const admin = { email: `e2e-dom-admin-${tag}@codeqlick.test`, password };
const clientEmail = `e2e-dom-client-${tag}@codeqlick.test`;
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('Domain renewal (e2e)', () => {
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
    // IANA's bootstrap and the .com registry's RDAP; everything else stays a real fetch.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url === 'https://data.iana.org/rdap/dns.json') {
        return Promise.resolve(
          Response.json({ services: [[['com'], ['https://rdap.example.test/com/v1/']]] }),
        );
      }
      if (url.startsWith('https://rdap.example.test/')) {
        return Promise.resolve(
          Response.json({
            events: [{ eventAction: 'expiration', eventDate: `${day(200)}T10:00:00Z` }],
          }),
        );
      }
      return realFetch(input, init);
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    ids.client = (
      await prisma.user.create({
        data: {
          email: clientEmail,
          name: 'Marta',
          role: Role.CLIENT,
          locale: Locale.ES,
          passwordHash,
        },
      })
    ).id;
    ids.project = (
      await prisma.clientProject.create({
        data: { clientId: ids.client, name: 'Peluquería Marta' },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId: ids.client! } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('reads RDAP or a typed date and reminds 30 and 7 days before', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    const domain = `/v1/admin/projects/${ids.project}/domain`;

    const rdap = await request(server)
      .put(domain)
      .set(auth)
      .send({ name: `marta-${tag}.com`, source: 'RDAP' })
      .expect(200);
    expect(rdap.body).toMatchObject({ source: 'RDAP', expiresAt: day(200), daysLeft: 200 });

    // .es: no RDAP, the team types the date.
    const es = await request(server)
      .put(domain)
      .set(auth)
      .send({ name: `marta-${tag}.es`, source: 'RDAP' })
      .expect(200);
    expect(es.body.expiresAt).toBeNull();
    await request(server)
      .put(domain)
      .set(auth)
      .send({ name: `marta-${tag}.es`, source: 'MANUAL', expiresAt: day(20) })
      .expect(200);
    const project = await request(server)
      .get(`/v1/admin/projects/${ids.project}`)
      .set(auth)
      .expect(200);
    expect(project.body).toMatchObject({ domainName: `marta-${tag}.es`, domainExpiresAt: day(20) });

    const domains = app.get(DomainsService);
    const forProject = () => sent.filter((message) => message.subject.includes(`marta-${tag}.es`));
    await domains.runDue();
    expect(forProject().map((message) => message.to)).toEqual(['hello@codeqlick.com', clientEmail]);
    expect(forProject()[1]?.subject).toBe(`Tu dominio marta-${tag}.es caduca en 20 días`);
    await domains.runDue();
    expect(forProject()).toHaveLength(2);
    // Two weeks later: the 7-day reminder, once.
    await domains.runDue(new Date(Date.now() + 14 * 86_400_000));
    expect(forProject()).toHaveLength(4);
    expect(forProject().at(-1)?.subject).toBe(`Tu dominio marta-${tag}.es caduca en 6 días`);
    await domains.runDue(new Date(Date.now() + 15 * 86_400_000));
    expect(forProject()).toHaveLength(4);
  });
});
