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
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'access-password-1';
const admin = { email: `e2e-access-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-access-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-access-other-${tag}@codeqlick.test`, password };

describe('Shared access (e2e)', () => {
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
    ids.client = (
      await prisma.user.create({
        data: {
          email: client.email,
          name: 'Grace',
          role: Role.CLIENT,
          locale: Locale.ES,
          passwordHash,
        },
      })
    ).id;
    ids.other = (
      await prisma.user.create({
        data: { email: other.email, name: 'Ada', role: Role.CLIENT, passwordHash },
      })
    ).id;
    ids.project = (
      await prisma.clientProject.create({ data: { clientId: ids.client, name: 'Tienda online' } })
    ).id;
    ids.otherProject = (
      await prisma.clientProject.create({ data: { clientId: ids.other, name: 'Otra' } })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.supportTicket.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.clientProject.deleteMany({
        where: { clientId: { in: [ids.client!, ids.other!] } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [admin.email, client.email, other.email] } },
      });
    }
    await app?.close();
  });

  it('keeps shared access encrypted, readable only by the team, and deletable', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const path = `/v1/portal/projects/${ids.project}/credentials`;

    await request(server).post(path).set(clientAuth).send({ label: 'Hosting' }).expect(400);
    const before = sent.length;
    const added = await request(server)
      .post(path)
      .set(clientAuth)
      .send({
        label: 'Hosting (OVH)',
        url: 'https://www.ovh.com/manager',
        username: 'grace@tienda.test',
        secret: 'S3cret-p@ss',
        notes: 'Código 2FA por SMS al 600…',
      })
      .expect(201);
    expect(added.body).toMatchObject({
      label: 'Hosting (OVH)',
      createdBy: { name: 'Grace' },
      viewedAt: null,
    });
    expect(added.body).not.toHaveProperty('secret');

    // Stored sealed; the team is told without the secret.
    const row = await prisma.projectCredential.findUniqueOrThrow({
      where: { id: added.body.id as string },
    });
    expect(row.secret).not.toContain('S3cret');
    expect(row.secret).toMatch(/^v1\./);
    expect(row.notes).not.toContain('SMS');
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)?.subject).toBe('Tienda online: Grace shared access (Hosting (OVH))');
    expect(`${sent.at(-1)?.text}${sent.at(-1)?.html}`).not.toContain('S3cret');

    // Nobody else sees it; the client can't read the secret back.
    await request(server).get(path).set(otherAuth).expect(404);
    const reveal = `/v1/admin/projects/${ids.project}/credentials/${added.body.id as string}/reveal`;
    await request(server).post(reveal).set(clientAuth).expect(403);

    // The team reads it; the client sees when.
    const revealed = await request(server).post(reveal).set(adminAuth).expect(200);
    expect(revealed.body).toEqual({ secret: 'S3cret-p@ss', notes: 'Código 2FA por SMS al 600…' });
    const list = await request(server).get(path).set(clientAuth).expect(200);
    expect(list.body[0].viewedAt).toEqual(expect.any(String));
    const viewed = await prisma.activityLog.count({
      where: { targetId: ids.project, action: 'project.credential_viewed' },
    });
    expect(viewed).toBe(1);

    // The client deletes one; the team deletes the rest when the project is done.
    const second = await request(server)
      .post(path)
      .set(clientAuth)
      .send({ label: 'Dominio', secret: 'otra' })
      .expect(201);
    await request(server)
      .delete(`${path}/${second.body.id as string}`)
      .set(clientAuth)
      .expect(204);
    const all = await request(server)
      .delete(`/v1/admin/projects/${ids.project}/credentials`)
      .set(adminAuth)
      .expect(200);
    expect(all.body).toEqual({ deleted: 1 });
    expect(await prisma.projectCredential.count({ where: { projectId: ids.project } })).toBe(0);
  });
});
