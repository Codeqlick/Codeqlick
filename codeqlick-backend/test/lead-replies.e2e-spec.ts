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
const admin = { email: `e2e-replies-admin-${tag}@codeqlick.test`, password: 'replies-password-1' };
const visitorEmail = `e2e-replies-visitor-${tag}@codeqlick.test`;

describe('Replies to leads (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];

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
    await prisma.user.create({
      data: {
        email: admin.email,
        name: 'Luis',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.lead.deleteMany({ where: { email: visitorEmail } });
      await prisma.user.deleteMany({ where: { email: admin.email } });
    }
    await app?.close();
  });

  it('emails the answer, keeps it in the history and marks a new lead as contacted', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = `Bearer ${login.body.accessToken as string}`;
    const lead = await prisma.lead.create({
      data: {
        name: 'Marta',
        email: visitorEmail,
        message: 'Queremos una tienda <online>.',
        locale: Locale.ES,
      },
    });
    const url = `/v1/admin/leads/${lead.id}/replies`;

    await request(server).get(url).set('Authorization', auth).expect(200, []);
    await request(server)
      .post(url)
      .set('Authorization', auth)
      .send({ subject: 'Re: tu tienda', body: '   ' })
      .expect(400);

    const first = await request(server)
      .post(url)
      .set('Authorization', auth)
      .send({
        subject: 'Re: tu tienda online',
        body: 'Hola Marta:\n\nGracias por escribirnos.\nTe propongo una llamada el martes.\n\nLuis',
      })
      .expect(201);
    expect(first.body.lead.status).toBe('TALKING');
    expect(first.body.reply).toMatchObject({
      subject: 'Re: tu tienda online',
      author: { name: 'Luis' },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(visitorEmail);
    expect(sent[0]?.subject).toBe('Re: tu tienda online');
    expect(sent[0]?.text).toContain('Gracias por escribirnos.\nTe propongo una llamada el martes.');
    expect(sent[0]?.text).toContain('Tu mensaje\n\nQueremos una tienda <online>.');
    expect(sent[0]?.html).toContain('Queremos una tienda &lt;online&gt;.');

    // A later reply leaves a status the admin set by hand alone.
    await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CALL' } });
    const second = await request(server)
      .post(url)
      .set('Authorization', auth)
      .send({ subject: 'Presupuesto', body: 'Te adjunto el presupuesto.' })
      .expect(201);
    expect(second.body.lead.status).toBe('CALL');

    // Nothing is stored when the email fails.
    vi.mocked(app.get(MailService).send).mockRejectedValueOnce(new Error('smtp down'));
    await request(server)
      .post(url)
      .set('Authorization', auth)
      .send({ subject: 'Falla', body: 'No llega.' })
      .expect(503);

    const history = await request(server).get(url).set('Authorization', auth).expect(200);
    expect(history.body.map((reply: { subject: string }) => reply.subject)).toEqual([
      'Re: tu tienda online',
      'Presupuesto',
    ]);
    const activity = await prisma.activityLog.count({
      where: { targetId: lead.id, action: 'lead.replied' },
    });
    expect(activity).toBe(2);

    await request(server)
      .post(`/v1/admin/leads/${randomUUID()}/replies`)
      .set('Authorization', auth)
      .send({ subject: 'x', body: 'x' })
      .expect(404);
  });
});
