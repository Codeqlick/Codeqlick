import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, PublishStatus, Role, TicketType } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'search-password-1';
const admin = { email: `e2e-as-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-as-client-${tag}@codeqlick.test`, password };
const postSlug = `e2e-admin-search-${tag}`;

type Group = { kind: string; items: { id: string; label: string; sublabel: string | null }[] };

describe('Admin search (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let adminAuth: { Authorization: string };
  let clientAuth: { Authorization: string };
  let clientId: string;
  let leadId: string;
  let projectId: string;
  let ticket: { id: string; number: number };
  let postId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: `Admin ${tag}`, role: Role.ADMIN, passwordHash },
    });
    clientId = (
      await prisma.user.create({
        data: { email: client.email, name: `Cliente ${tag}`, role: Role.CLIENT, passwordHash },
      })
    ).id;
    leadId = (
      await prisma.lead.create({
        data: {
          name: `Lead ${tag}`,
          email: `e2e-as-lead-${tag}@codeqlick.test`,
          company: `Acme ${tag}`,
          message: 'Needs a website.',
        },
      })
    ).id;
    projectId = (await prisma.clientProject.create({ data: { clientId, name: `Shop ${tag}` } })).id;
    ticket = await prisma.supportTicket.create({
      data: { clientId, type: TicketType.QUESTION, title: `Help with ${tag}` },
      select: { id: true, number: true },
    });
    postId = (
      await prisma.post.create({
        data: {
          slug: postSlug,
          status: PublishStatus.DRAFT,
          translations: {
            create: [
              { locale: Locale.EN, title: `Draft post ${tag}`, excerpt: 'x', content: 'x' },
              { locale: Locale.ES, title: `Borrador ${tag}`, excerpt: 'x', content: 'x' },
            ],
          },
        },
      })
    ).id;

    const server = app.getHttpServer();
    const adminLogin = await request(server).post('/v1/auth/login').send(admin).expect(200);
    adminAuth = { Authorization: `Bearer ${adminLogin.body.accessToken as string}` };
    const clientLogin = await request(server).post('/v1/auth/login').send(client).expect(200);
    clientAuth = { Authorization: `Bearer ${clientLogin.body.accessToken as string}` };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { slug: postSlug } });
      await prisma.lead.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.supportTicket.deleteMany({ where: { clientId } });
      await prisma.clientProject.deleteMany({ where: { clientId } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('is for admins only', async () => {
    const server = app.getHttpServer();
    await request(server).get('/v1/admin/search').query({ q: tag }).expect(401);
    await request(server).get('/v1/admin/search').query({ q: tag }).set(clientAuth).expect(403);
  });

  it('refuses a q shorter than 2 characters once trimmed, or longer than 100', async () => {
    const server = app.getHttpServer();
    const search = (q?: string) =>
      request(server)
        .get('/v1/admin/search')
        .query(q === undefined ? {} : { q })
        .set(adminAuth);
    await search().expect(400);
    await search('a').expect(400);
    await search(' a ').expect(400);
    await search('x'.repeat(101)).expect(400);
  });

  it('groups what it finds by kind, in the fixed order, with labels and sublabels', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/search')
      .query({ q: ` ${tag.toUpperCase()} ` })
      .set(adminAuth)
      .expect(200);
    const body = res.body as { q: string; groups: Group[] };
    expect(body.q).toBe(tag.toUpperCase());
    expect(body.groups.map((group) => group.kind)).toEqual([
      'lead',
      'user',
      'project',
      'ticket',
      'post',
    ]);
    const group = (kind: string) => body.groups.find((g) => g.kind === kind)!.items;
    expect(group('lead')).toEqual([
      {
        id: leadId,
        label: `Lead ${tag}`,
        sublabel: `Acme ${tag} · e2e-as-lead-${tag}@codeqlick.test`,
      },
    ]);
    expect(group('user')).toEqual(
      expect.arrayContaining([
        { id: clientId, label: `Cliente ${tag}`, sublabel: client.email },
        expect.objectContaining({ label: `Admin ${tag}`, sublabel: admin.email }),
      ]),
    );
    expect(group('project')).toEqual([
      { id: projectId, label: `Shop ${tag}`, sublabel: `Cliente ${tag}` },
    ]);
    expect(group('ticket')).toEqual([
      { id: ticket.id, label: `Help with ${tag}`, sublabel: `#${ticket.number} · Cliente ${tag}` },
    ]);
    expect(group('post')).toEqual([{ id: postId, label: `Draft post ${tag}`, sublabel: postSlug }]);
  });

  it('titles posts in the requested locale', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/search')
      .query({ q: postSlug, locale: 'es' })
      .set(adminAuth)
      .expect(200);
    expect((res.body as { groups: Group[] }).groups).toEqual([
      { kind: 'post', items: [{ id: postId, label: `Borrador ${tag}`, sublabel: postSlug }] },
    ]);
  });

  it('finds a request by its number, with or without #', async () => {
    for (const q of [`#${ticket.number}`, String(ticket.number)]) {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/search')
        .query({ q })
        .set(adminAuth)
        .expect(200);
      const tickets = (res.body as { groups: Group[] }).groups.find((g) => g.kind === 'ticket');
      expect(tickets?.items).toContainEqual(expect.objectContaining({ id: ticket.id }));
    }
  });
});
