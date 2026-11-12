import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { CloudFormsService } from '../src/modules/cloud/cloud-forms.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'cloud-forms-password-1';
const owner = { email: `e2e-cf-owner-${tag}@codeqlick.test`, password };
const outsider = { email: `e2e-cf-out-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };

describe('Codeqlick Cloud forms (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let root: string;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-cloud-forms-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(AppConfigService), 'cloudHosting', 'get').mockReturnValue({
      domain: 'cloud.test',
      root,
    });
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const registeredAt = new Date();
    ids.owner = (
      await prisma.user.create({
        data: { email: owner.email, name: 'Ada', role: Role.CLIENT, passwordHash, registeredAt },
      })
    ).id;
    ids.outsider = (
      await prisma.user.create({
        data: { email: outsider.email, name: 'Eve', role: Role.CLIENT, passwordHash, registeredAt },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: `f-${tag}` } });
      await prisma.cloudProject.deleteMany({ where: { slug: `fp-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('creates forms, takes posts from the project only, keeps, emails, searches and exports', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Forms', slug: `f-${tag}`, ...terms })
      .expect(201);
    const project = await request(server)
      .post(`/v1/cloud/teams/f-${tag}/projects`)
      .set(auth)
      .send({ name: 'Site', slug: `fp-${tag}` })
      .expect(201);
    const base = `/v1/cloud/projects/${project.body.id as string}/forms`;

    // Recipients are members only (decision 37).
    await request(server)
      .post(base)
      .set(auth)
      .send({ name: 'Contact', recipientIds: [ids.outsider] })
      .expect(400);
    const form = await request(server)
      .post(base)
      .set(auth)
      .send({ name: 'Contact', recipientIds: [ids.owner] })
      .expect(201);
    expect(form.body).toMatchObject({
      name: 'Contact',
      enabled: true,
      notify: true,
      submissions: 0,
    });
    expect(form.body.key).toMatch(/^cqf_/);
    expect(form.body.endpoint).toMatch(/\/cloud\/forms\/cqf_/);
    const key = form.body.key as string;
    const site = `https://fp-${tag}.cloud.test`;

    // A browser post from another site is refused; CORS answers any origin's preflight.
    await request(server)
      .post(`/v1/cloud/forms/${key}`)
      .set('Origin', 'https://evil.example')
      .send({ name: 'x', message: 'y' })
      .expect(403);
    const preflight = await request(server)
      .options(`/v1/cloud/forms/${key}`)
      .set('Origin', site)
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBe(site);

    // JSON from the site.
    const json = await request(server)
      .post(`/v1/cloud/forms/${key}`)
      .set('Origin', site)
      .send({ name: 'Grace', email: 'grace@example.com', message: 'Hello there', _subject: 'Hi' })
      .expect(200);
    expect(json.body).toEqual({ ok: true });
    // A plain form goes back to its page with ?form=ok.
    const plain = await request(server)
      .post(`/v1/cloud/forms/${key}`)
      .type('form')
      .set('Origin', site)
      .set('Referer', `${site}/contact?x=1`)
      .send({ name: 'Linus', message: 'Second', topics: 'a' })
      .expect(303);
    expect(plain.headers.location).toBe(`${site}/contact?x=1&form=ok`);
    // Honeypot: a success, nothing kept. Empty: an error page.
    await request(server)
      .post(`/v1/cloud/forms/${key}`)
      .set('Origin', site)
      .send({ name: 'bot', _gotcha: 'filled' })
      .expect(200);
    await request(server)
      .post(`/v1/cloud/forms/${key}`)
      .type('form')
      .send({ _subject: 'x' })
      .expect(400);

    await vi.waitFor(() => expect(sent.filter((m) => m.to === owner.email)).toHaveLength(2));
    const email = sent.find((m) => m.subject === 'Hi');
    expect(email).toMatchObject({ replyTo: 'grace@example.com' });
    expect(email?.text).toContain('Hello there');

    const list = await request(server)
      .get(`${base}/${form.body.id as string}/submissions`)
      .set(auth)
      .expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0]).toMatchObject({ data: { name: 'Linus' }, page: `${site}/contact` });
    const search = await request(server)
      .get(`${base}/${form.body.id as string}/submissions?q=GRACE`)
      .set(auth)
      .expect(200);
    expect(search.body.items.map((s: { email: string }) => s.email)).toEqual(['grace@example.com']);

    const csv = await request(server)
      .get(`${base}/${form.body.id as string}/submissions.csv`)
      .set(auth)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('date,name,message,topics,email,page');

    await request(server)
      .delete(`${base}/${form.body.id as string}/submissions/${list.body.items[0].id as string}`)
      .set(auth)
      .expect(204);

    // A new key stops the old one; paused forms answer 404.
    const replaced = await request(server)
      .post(`${base}/${form.body.id as string}/key`)
      .set(auth)
      .expect(200);
    await request(server).post(`/v1/cloud/forms/${key}`).send({ a: 'b' }).expect(404);
    await request(server)
      .patch(`${base}/${form.body.id as string}`)
      .set(auth)
      .send({ enabled: false })
      .expect(200);
    await request(server)
      .post(`/v1/cloud/forms/${replaced.body.key as string}`)
      .send({ a: 'b' })
      .expect(404);

    // Old submissions go after 180 days.
    await prisma.cloudFormSubmission.updateMany({
      where: { formId: form.body.id as string },
      data: { createdAt: new Date(Date.now() - 181 * 86_400_000) },
    });
    await app.get(CloudFormsService).cleanup();
    expect(
      await prisma.cloudFormSubmission.count({ where: { formId: form.body.id as string } }),
    ).toBe(0);
  });
});
