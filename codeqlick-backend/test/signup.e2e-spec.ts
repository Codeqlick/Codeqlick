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

// Its own file, so its own app: sign-ups are limited to 3 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'signup-password-1';
const admin = { email: `e2e-su-admin-${tag}@codeqlick.test`, password };
const fresh = `e2e-su-new-${tag}@codeqlick.test`;
const lead = `e2e-su-lead-${tag}@codeqlick.test`;

const tokenIn = (message: MailMessage | undefined, path: string) =>
  new RegExp(`${path}\\?(?:token|invitation)=([\\w-]+)`).exec(message?.text ?? '')?.[1];

describe('Clients create their own account (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  const sent: MailMessage[] = [];
  const to = (email: string) => sent.filter((message) => message.to === email);

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
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send(admin).expect(200);
    auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.lead.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.proposal.deleteMany({ where: { client: { email: { contains: `-${tag}@` } } } });
      await prisma.signupToken.deleteMany({ where: { email: { contains: `-${tag}@` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('signs up with a confirmed email, and never says whether an email has an account', async () => {
    const server = app.getHttpServer();
    const body = { name: 'Ada', email: fresh, password, locale: 'es', acceptPrivacy: true };
    await request(server)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', '203.0.113.20')
      .send({ ...body, acceptPrivacy: false })
      .expect(400);
    await request(server)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', '203.0.113.20')
      .send(body)
      .expect(202);
    // No account until the email is confirmed.
    expect(await prisma.user.count({ where: { email: fresh } })).toBe(0);
    const token = tokenIn(to(fresh).at(-1), '/es/register/confirm');
    expect(to(fresh).at(-1)?.subject).toBe('Confirma tu email — Codeqlick');

    const signedIn = await request(server)
      .post('/v1/auth/register/confirm')
      .send({ token })
      .expect(200);
    expect(signedIn.body.user).toMatchObject({ email: fresh, name: 'Ada', role: 'CLIENT' });
    await request(server).post('/v1/auth/register/confirm').send({ token }).expect(400);
    await request(server).post('/v1/auth/login').send({ email: fresh, password }).expect(200);

    // Again with the same email: 202 as well, and the owner is told they have an account.
    await request(server)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', '203.0.113.21')
      .send({ ...body, password: 'someone-else-pass-1' })
      .expect(202);
    expect(to(fresh).at(-1)?.subject).toBe('Ya tienes una cuenta en Codeqlick');
    await request(server).post('/v1/auth/login').send({ email: fresh, password }).expect(200);

    // The honeypot sends nothing.
    const before = sent.length;
    await request(server)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', '203.0.113.22')
      .send({ ...body, email: `e2e-su-bot-${tag}@codeqlick.test`, website: 'x' })
      .expect(202);
    expect(sent.length).toBe(before);
  });

  it('keeps what the team prepared for an email until its owner registers with it', async () => {
    const server = app.getHttpServer();
    const row = await prisma.lead.create({
      data: {
        name: 'Marta',
        email: lead,
        company: 'Peluquería Marta',
        message: 'x',
        locale: Locale.ES,
        siteRequest: {
          preset: 'peluqueria',
          business: { name: 'Peluquería Marta', kind: 'Peluquería', city: 'Sevilla' },
        },
      },
    });
    const before = to(lead).length;
    const drafted = await request(server)
      .post(`/v1/admin/leads/${row.id}/proposal`)
      .set(auth)
      .expect(201);
    expect(drafted.body.client).toMatchObject({ created: true, registered: false });
    // Preparing it sends nobody anything, and nobody can sign in to it.
    expect(to(lead).length).toBe(before);
    const placeholder = await prisma.user.findUniqueOrThrow({ where: { email: lead } });
    expect(placeholder.registeredAt).toBeNull();

    // Sending the proposal carries the invitation instead of the portal link.
    await request(server)
      .post(`/v1/admin/proposals/${drafted.body.proposalId as string}/send`)
      .set(auth)
      .expect(200);
    const proposalEmail = to(lead).at(-1);
    expect(proposalEmail?.html).toContain('Crear mi cuenta y verla');
    expect(tokenIn(proposalEmail, '/es/register')).toBeDefined();

    // "Forgot my password" on it sends the invitation too.
    await request(server)
      .post('/v1/auth/password-reset/request')
      .send({ email: lead, locale: 'es' })
      .expect(202);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(to(lead).at(-1)?.subject).toBe('Crea tu cuenta en Codeqlick');

    // They sign up on their own with that email: the account, and its proposal, are theirs.
    await request(server)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', '203.0.113.23')
      .send({ name: 'Marta Ruiz', email: lead, password, locale: 'es', acceptPrivacy: true })
      .expect(202);
    const token = tokenIn(to(lead).at(-1), '/es/register/confirm');
    const signedIn = await request(server)
      .post('/v1/auth/register/confirm')
      .send({ token })
      .expect(200);
    expect(signedIn.body.user).toMatchObject({ id: placeholder.id, name: 'Marta Ruiz' });
    const proposals = await request(server)
      .get('/v1/portal/proposals')
      .set('Authorization', `Bearer ${signedIn.body.accessToken as string}`)
      .expect(200);
    expect(JSON.stringify(proposals.body)).toContain(drafted.body.proposalId as string);
  });
});
