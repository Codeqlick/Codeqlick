import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHmac, randomUUID } from 'node:crypto';
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

// What notification channels are sent (real fetching refuses made-up hosts): every post is kept
// and answered `answer.status`. The URL checks stay the real ones.
const posts = vi.hoisted(
  () => [] as Array<{ url: string; body: string; headers: Record<string, string> }>,
);
const answer = vi.hoisted(() => ({ status: 200 }));
vi.mock('../src/modules/site-audits/safe-fetch.js', async (original) => {
  const actual = await original<typeof import('../src/modules/site-audits/safe-fetch.js')>();
  return {
    ...actual,
    safePost: vi.fn((url: string, body: string, headers: Record<string, string>) => {
      posts.push({ url, body, headers });
      return Promise.resolve({ status: answer.status, body: 'ok' });
    }),
  };
});

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
      await prisma.cloudTeam.deleteMany({ where: { slug: { in: [`f-${tag}`, `fn-${tag}`] } } });
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

  it('sends stored submissions to the Slack, Discord and webhook channels that follow the form', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Notify', slug: `fn-${tag}`, ...terms })
      .expect(201);
    const project = await request(server)
      .post(`/v1/cloud/teams/fn-${tag}/projects`)
      .set(auth)
      .send({ name: 'Shop', slug: `fn-${tag}` })
      .expect(201);
    const other = await request(server)
      .post(`/v1/cloud/teams/fn-${tag}/projects`)
      .set(auth)
      .send({ name: 'Other', slug: `fo-${tag}` })
      .expect(201);
    const projectId = project.body.id as string;
    const newForm = async (id: string, name: string) =>
      (
        await request(server)
          .post(`/v1/cloud/projects/${id}/forms`)
          .set(auth)
          .send({ name, notify: false, recipientIds: [ids.owner] })
          .expect(201)
      ).body as { id: string; key: string };
    const contact = await newForm(projectId, 'Contact');
    const quote = await newForm(projectId, 'Quote');
    const elsewhere = await newForm(other.body.id as string, 'Elsewhere');

    // Forms of the project only; never by email (decision 63).
    const notifications = `/v1/cloud/projects/${projectId}/notifications`;
    await request(server)
      .post(notifications)
      .set(auth)
      .send({
        kind: 'WEBHOOK',
        name: 'CRM',
        url: 'https://hooks.example.com/forms/abcd',
        formSubmitted: true,
        formIds: [elsewhere.id],
      })
      .expect(400);
    await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'EMAIL', name: 'Team', recipientIds: [ids.owner], formSubmitted: true })
      .expect(400);
    const hook = await request(server)
      .post(notifications)
      .set(auth)
      .send({
        kind: 'WEBHOOK',
        name: 'CRM',
        url: 'https://hooks.example.com/forms/abcd',
        buildFailed: false,
        formSubmitted: true,
      })
      .expect(201);
    expect(hook.body).toMatchObject({ formSubmitted: true, formIds: [] });
    const secret = hook.body.secret as string;
    const slack = await request(server)
      .post(notifications)
      .set(auth)
      .send({
        kind: 'SLACK',
        name: 'Sales',
        url: 'https://hooks.slack.com/services/T0/B0/quote',
        formSubmitted: true,
        formIds: [quote.id, quote.id],
      })
      .expect(201);
    expect(slack.body).toMatchObject({ formSubmitted: true, formIds: [quote.id] });
    const email = await request(server)
      .post(notifications)
      .set(auth)
      .send({ kind: 'EMAIL', name: 'Team', recipientIds: [ids.owner] })
      .expect(201);
    expect(email.body).toMatchObject({ formSubmitted: false, formIds: [] });
    await request(server)
      .patch(`${notifications}/${email.body.id as string}`)
      .set(auth)
      .send({ formSubmitted: true })
      .expect(400);
    await request(server)
      .post(`${notifications}/${email.body.id as string}/test`)
      .set(auth)
      .send({ event: 'form' })
      .expect(400);

    // A stored submission goes to the webhook, signed; the Slack channel follows another form.
    const visitor = { 'X-Forwarded-For': '203.0.113.63' };
    posts.length = 0;
    await request(server)
      .post(`/v1/cloud/forms/${contact.key}`)
      .set(visitor)
      .send({ name: 'Grace', email: 'grace@example.com', message: 'Hello' })
      .expect(200);
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    const delivered = posts[0]!;
    expect(delivered.url).toBe('https://hooks.example.com/forms/abcd');
    expect(delivered.headers['X-Codeqlick-Event']).toBe('form.submitted');
    expect(delivered.headers['X-Codeqlick-Signature']).toBe(
      `sha256=${createHmac('sha256', secret).update(delivered.body).digest('hex')}`,
    );
    const stored = await prisma.cloudFormSubmission.findFirstOrThrow({
      where: { formId: contact.id },
    });
    expect(JSON.parse(delivered.body)).toMatchObject({
      event: 'form.submitted',
      project: { slug: `fn-${tag}`, name: 'Shop' },
      form: { id: contact.id, name: 'Contact' },
      submission: {
        id: stored.id,
        fields: [
          ['name', 'Grace'],
          ['email', 'grace@example.com'],
          ['message', 'Hello'],
        ],
        email: 'grace@example.com',
        page: null,
        createdAt: stored.createdAt.toISOString(),
        url: expect.stringContaining(
          `/en/console/fn-${tag}/fn-${tag}?tab=forms&form=${contact.id}`,
        ),
      },
    });
    await vi.waitFor(async () =>
      expect(
        await prisma.cloudNotifyChannel.findUniqueOrThrow({
          where: { id: hook.body.id as string },
        }),
      ).toMatchObject({ lastOk: true, failures: 0 }),
    );

    // A honeypot hit, a post from another site and one over the month's limit send nothing; a
    // submission to the other form reaches both channels.
    await request(server)
      .post(`/v1/cloud/forms/${contact.key}`)
      .set(visitor)
      .send({ name: 'bot', _gotcha: 'filled' })
      .expect(200);
    await request(server)
      .post(`/v1/cloud/forms/${contact.key}`)
      .set(visitor)
      .set('Origin', 'https://evil.example')
      .send({ name: 'evil' })
      .expect(403);
    await prisma.cloudFormSubmission.createMany({
      data: Array.from({ length: 1000 }, () => ({
        formId: contact.id,
        data: [['filler', 'x']],
        email: 'filler@example.com',
      })),
    });
    await request(server)
      .post(`/v1/cloud/forms/${contact.key}`)
      .set(visitor)
      .send({ name: 'overflow' })
      .expect(429);
    await prisma.cloudFormSubmission.deleteMany({
      where: { formId: contact.id, email: 'filler@example.com' },
    });
    const beforeQuote = new Date();
    await request(server)
      .post(`/v1/cloud/forms/${quote.key}`)
      .set(visitor)
      .send({ name: 'Linus', budget: '<!channel> 5000 & up' })
      .expect(200);
    await vi.waitFor(() => expect(posts).toHaveLength(3));
    for (const word of ['bot', 'evil', 'overflow']) {
      expect(posts.some((p) => p.body.includes(word))).toBe(false);
    }
    const toSlack = posts.filter((p) => p.url.startsWith('https://hooks.slack.com/'));
    expect(toSlack).toHaveLength(1);
    const text = (JSON.parse(toSlack[0]!.body) as { text: string }).text;
    expect(text).toContain('new submission to *Quote*');
    expect(text).toContain('budget: &lt;!channel&gt; 5000 &amp; up');

    // A 429 is recorded but never counts towards switching the channel off (once the webhook's
    // Quote delivery is recorded, so its reset of the count can't land afterwards).
    await vi.waitFor(async () => {
      const recorded = await prisma.cloudNotifyChannel.findUniqueOrThrow({
        where: { id: hook.body.id as string },
      });
      expect(recorded.lastOk).toBe(true);
      expect(recorded.lastSentAt!.getTime()).toBeGreaterThanOrEqual(beforeQuote.getTime());
    });
    await prisma.cloudNotifyChannel.update({
      where: { id: hook.body.id as string },
      data: { failures: 9 },
    });
    answer.status = 429;
    await request(server)
      .post(`/v1/cloud/forms/${contact.key}`)
      .set(visitor)
      .send({ name: 'Slow' })
      .expect(200);
    await vi.waitFor(async () =>
      expect(
        await prisma.cloudNotifyChannel.findUniqueOrThrow({
          where: { id: hook.body.id as string },
        }),
      ).toMatchObject({ lastOk: false, lastError: 'HTTP 429: ok', failures: 9, enabled: true }),
    );
    answer.status = 200;

    // Deleting a form takes it out of the channels; one left with none stops getting submissions.
    await request(server)
      .delete(`/v1/cloud/projects/${projectId}/forms/${quote.id}`)
      .set(auth)
      .expect(204);
    const listed = await request(server).get(notifications).set(auth).expect(200);
    expect(
      (listed.body.items as Array<{ id: string }>).find((c) => c.id === slack.body.id),
    ).toMatchObject({ formIds: [], formSubmitted: false });

    // "Send a test" with a sample submission.
    const tested = await request(server)
      .post(`${notifications}/${hook.body.id as string}/test`)
      .set(auth)
      .send({ event: 'form' })
      .expect(200);
    expect(tested.body).toEqual({ ok: true, error: null });
    const sample = posts.at(-1)!;
    expect(sample.headers['X-Codeqlick-Event']).toBe('test');
    expect(JSON.parse(sample.body)).toMatchObject({
      event: 'test',
      form: { name: 'Contact' },
      submission: { url: expect.stringContaining('?tab=forms') },
    });
  });
});
