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
      await prisma.cloudTeam.deleteMany({
        where: { slug: { in: [`f-${tag}`, `fn-${tag}`, `fs-${tag}`] } },
      });
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

  describe('spam filter', () => {
    interface Sub {
      id: string;
      data: Record<string, string>;
      page: string | null;
      spam: boolean;
      spamReason: string | null;
    }
    interface FormBody {
      id: string;
      key: string;
      spamFilter: boolean;
      submissions: number;
      spam: number;
    }
    let auth: { Authorization: string };
    let projectId = '';
    let base = '';
    let site = '';
    let main: FormBody;
    let hits = 0;

    // Each post comes from its own IP: the endpoint allows 10 per minute and IP.
    const visit = (key: string) =>
      request(app.getHttpServer())
        .post(`/v1/cloud/forms/${key}`)
        .set('X-Forwarded-For', `10.8.0.${(hits += 1)}`);
    const send = (key: string, body: Record<string, string>, referer?: string) =>
      visit(key)
        .set(referer ? { Referer: referer } : {})
        .send(body);
    const emailed = (marker: string) =>
      sent.filter((m) => m.to === owner.email && m.text.includes(marker)).length;
    const hooked = (marker: string) => posts.filter((p) => p.body.includes(marker)).length;
    const newForm = async (name: string, extra: Record<string, unknown> = {}) =>
      (
        await request(app.getHttpServer())
          .post(base)
          .set(auth)
          .send({ name, recipientIds: [ids.owner], ...extra })
          .expect(201)
      ).body as FormBody;
    const list = async (formId: string, query: string) =>
      (
        await request(app.getHttpServer())
          .get(`${base}/${formId}/submissions?pageSize=100${query}`)
          .set(auth)
          .expect(200)
      ).body as { total: number; items: Sub[] };
    const find = async (formId: string, marker: string, spam: boolean) => {
      const found = (await list(formId, `&spam=${spam}`)).items.find((item) =>
        JSON.stringify(item.data).includes(marker),
      );
      if (!found) throw new Error(`No ${spam ? 'spam' : 'inbox'} submission with ${marker}`);
      return found;
    };
    const formView = async (formId: string) =>
      (
        (await request(app.getHttpServer()).get(base).set(auth).expect(200)).body as {
          items: FormBody[];
        }
      ).items.find((form) => form.id === formId);
    // The mail and the channels run in the background: once a later normal post has been
    // delivered, an earlier one that was going to be delivered has been too.
    const barrier = async (marker: string) => {
      await send(main.key, { message: marker }).expect(200);
      await vi.waitFor(() => {
        expect(emailed(marker)).toBe(1);
        expect(hooked(marker)).toBe(1);
      });
    };

    beforeAll(async () => {
      const server = app.getHttpServer();
      const login = await request(server).post('/v1/auth/login').send(owner).expect(200);
      auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
      await request(server)
        .post('/v1/cloud/teams')
        .set(auth)
        .send({ name: 'Spam', slug: `fs-${tag}`, ...terms })
        .expect(201);
      const project = await request(server)
        .post(`/v1/cloud/teams/fs-${tag}/projects`)
        .set(auth)
        .send({ name: 'Blog', slug: `fs-${tag}` })
        .expect(201);
      projectId = project.body.id as string;
      base = `/v1/cloud/projects/${projectId}/forms`;
      site = `https://fs-${tag}.cloud.test`;
      await request(server)
        .post(`/v1/cloud/projects/${projectId}/notifications`)
        .set(auth)
        .send({
          kind: 'WEBHOOK',
          name: 'CRM',
          url: 'https://hooks.example.com/forms/spam',
          buildFailed: false,
          formSubmitted: true,
        })
        .expect(201);
      main = await newForm('Contact');
    });

    it('is on by default and keeps spam apart: answered as a success, never emailed or sent to channels', async () => {
      expect(main).toMatchObject({ spamFilter: true, submissions: 0, spam: 0 });
      posts.length = 0;

      // Each of these gets the normal answer; none is delivered.
      const spam: Array<[string, Record<string, string>, string | undefined]> = [
        [
          'mk-markup',
          { name: 'Seo', message: 'cheap [url=http://a.example]pills[/url] mk-markup' },
          undefined,
        ],
        [
          'mk-links',
          { message: 'http://a.example http://b.example https://c.example www.d.example mk-links' },
          undefined,
        ],
        ['mk-field', { name: 'visit https://spam.example mk-field', message: 'Hi' }, undefined],
        ['mk-page', { name: 'Ada', message: 'mk-page' }, 'https://spam.example/post'],
      ];
      for (const [, body, referer] of spam) {
        const res = await send(main.key, body, referer).expect(200);
        expect(res.body).toEqual({ ok: true });
      }
      // A plain form post is answered with the redirect, spam or not.
      const plain = await visit(main.key)
        .type('form')
        .set('Referer', `${site}/contact`)
        .send({ message: 'a <a href="http://x.example">x</a> mk-plain' })
        .expect(303);
      expect(plain.headers.location).toBe(`${site}/contact?form=ok`);

      // Normal posts: three links are fine, a post from the project's own site too.
      await send(main.key, {
        message: 'http://a.example http://b.example http://c.example mk-three',
      })
        .set('Referer', `${site}/contact`)
        .expect(200);
      await send(main.key, {
        name: 'Grace',
        email: 'grace@example.com',
        message: 'mk-normal',
      }).expect(200);
      await vi.waitFor(() => {
        expect(emailed('mk-three')).toBe(1);
        expect(emailed('mk-normal')).toBe(1);
        expect(hooked('mk-three')).toBe(1);
        expect(hooked('mk-normal')).toBe(1);
      });
      for (const marker of ['mk-markup', 'mk-links', 'mk-field', 'mk-page', 'mk-plain']) {
        expect(emailed(marker)).toBe(0);
        expect(hooked(marker)).toBe(0);
      }

      // Kept, with the first rule that matched.
      const reasons: Record<string, string> = {
        'mk-markup': 'markup',
        'mk-links': 'links',
        'mk-field': 'field',
        'mk-page': 'page',
        'mk-plain': 'markup',
      };
      for (const [marker, reason] of Object.entries(reasons)) {
        expect(await find(main.id, marker, true)).toMatchObject({ spam: true, spamReason: reason });
      }
      expect((await find(main.id, 'mk-page', true)).page).toBe('https://spam.example/post');
      expect(await find(main.id, 'mk-normal', false)).toMatchObject({
        spam: false,
        spamReason: null,
      });
    });

    it('flags the third identical post within the hour as spam, the first two are delivered', async () => {
      const body = { name: 'Ada', message: 'mk-repeat' };
      for (let i = 0; i < 3; i += 1) {
        expect((await send(main.key, body).expect(200)).body).toEqual({ ok: true });
      }
      await barrier('mk-after-repeat');
      expect(emailed('mk-repeat')).toBe(2);
      expect(hooked('mk-repeat')).toBe(2);
      const spam = (await list(main.id, '&spam=true')).items.filter(
        (s) => s.data.message === 'mk-repeat',
      );
      expect(spam).toHaveLength(1);
      expect(spam[0]).toMatchObject({ spamReason: 'repeat' });
      const inbox = (await list(main.id, '&spam=false')).items.filter(
        (s) => s.data.message === 'mk-repeat',
      );
      expect(inbox).toHaveLength(2);

      // The same content an hour ago doesn't count.
      await prisma.cloudFormSubmission.updateMany({
        where: { id: { in: inbox.map((s) => s.id) } },
        data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
      });
      await send(main.key, body).expect(200);
      expect(
        (await list(main.id, '&spam=true')).items.filter((s) => s.data.message === 'mk-repeat'),
      ).toHaveLength(1);
    });

    it('lists the inbox or the spam, counts both in the form, and leaves spam out of the CSV and search', async () => {
      const inbox = await list(main.id, '');
      const explicit = await list(main.id, '&spam=false');
      const spam = await list(main.id, '&spam=true');
      expect(inbox.items.every((s) => !s.spam)).toBe(true);
      expect(explicit.total).toBe(inbox.total);
      expect(spam.items.every((s) => s.spam && s.spamReason !== null)).toBe(true);
      expect(spam.total).toBeGreaterThanOrEqual(6);
      expect(inbox.items.some((s) => s.data.message === 'mk-normal')).toBe(true);
      expect(inbox.items.some((s) => JSON.stringify(s.data).includes('mk-markup'))).toBe(false);
      expect(await formView(main.id)).toMatchObject({
        spamFilter: true,
        submissions: inbox.total,
        spam: spam.total,
      });

      // The search works in both views, each in its own.
      expect((await list(main.id, '&spam=true&q=MK-MARKUP')).total).toBe(1);
      expect((await list(main.id, '&q=mk-markup')).total).toBe(0);
      expect((await list(main.id, '&q=mk-normal')).total).toBe(1);
      expect((await list(main.id, '&spam=true&q=mk-normal')).total).toBe(0);

      await request(app.getHttpServer())
        .get(`${base}/${main.id}/submissions?spam=maybe`)
        .set(auth)
        .expect(400);

      const csv = await request(app.getHttpServer())
        .get(`${base}/${main.id}/submissions.csv`)
        .set(auth)
        .expect(200);
      expect(csv.text).toContain('mk-normal');
      expect(csv.text).not.toContain('mk-markup');
      expect(csv.text).not.toContain('mk-page');
      expect(csv.text.trim().split('\r\n')).toHaveLength(inbox.total + 1);

      // Spam can be deleted like any submission.
      const doomed = await find(main.id, 'mk-plain', true);
      await request(app.getHttpServer())
        .delete(`${base}/${main.id}/submissions/${doomed.id}`)
        .set(auth)
        .expect(204);
      expect((await list(main.id, '&spam=true&q=mk-plain')).total).toBe(0);
    });

    it('switches off: nothing is flagged, and on again from the console', async () => {
      const open = await newForm('Open', { spamFilter: false });
      expect(open).toMatchObject({ spamFilter: false, spam: 0 });
      const bodies: Array<Record<string, string>> = [
        { message: 'x [url=http://a.example]y[/url] mk-off' },
        { message: 'http://a http://b http://c http://d mk-off' },
        { email: 'not-an-email', message: 'mk-off' },
        { name: 'same', message: 'mk-off-repeat' },
        { name: 'same', message: 'mk-off-repeat' },
        { name: 'same', message: 'mk-off-repeat' },
      ];
      for (const body of bodies) {
        await send(open.key, body, 'https://spam.example/post').expect(200);
      }
      expect(await list(open.id, '&spam=true')).toMatchObject({ total: 0 });
      expect((await list(open.id, '')).total).toBe(bodies.length);
      expect(await formView(open.id)).toMatchObject({
        spamFilter: false,
        submissions: bodies.length,
        spam: 0,
      });

      const patched = await request(app.getHttpServer())
        .patch(`${base}/${open.id}`)
        .set(auth)
        .send({ spamFilter: true })
        .expect(200);
      expect(patched.body).toMatchObject({ spamFilter: true, submissions: bodies.length, spam: 0 });
      await send(open.key, { message: '[url=http://a.example]z[/url] mk-on' }).expect(200);
      expect(await formView(open.id)).toMatchObject({ submissions: bodies.length, spam: 1 });
      // A patch without it leaves it alone.
      const renamed = await request(app.getHttpServer())
        .patch(`${base}/${open.id}`)
        .set(auth)
        .send({ name: 'Open 2' })
        .expect(200);
      expect(renamed.body).toMatchObject({ name: 'Open 2', spamFilter: true, spam: 1 });
    });

    it('moves a submission out of spam and delivers it once, or into spam by hand', async () => {
      const spamUrl = (formId: string, id: string) => `${base}/${formId}/submissions/${id}/spam`;
      const server = app.getHttpServer();
      const flagged = await find(main.id, 'mk-field', true);
      expect(emailed('mk-field')).toBe(0);

      // Not spam: delivered now, by email and to the channels, and in the inbox.
      const moved = await request(server)
        .post(spamUrl(main.id, flagged.id))
        .set(auth)
        .send({ spam: false })
        .expect(200);
      expect(moved.body).toMatchObject({ id: flagged.id, spam: false, spamReason: null });
      await vi.waitFor(() => {
        expect(emailed('mk-field')).toBe(1);
        expect(hooked('mk-field')).toBe(1);
      });
      expect(await find(main.id, 'mk-field', false)).toMatchObject({ spam: false });
      expect((await list(main.id, '&spam=true&q=mk-field')).total).toBe(0);

      // Spam by hand, and back: it had been delivered already, so nothing more is sent. The same
      // goes for a submission that was delivered when it came.
      const byHand = await request(server)
        .post(spamUrl(main.id, flagged.id))
        .set(auth)
        .send({ spam: true })
        .expect(200);
      expect(byHand.body).toMatchObject({ spam: true, spamReason: 'manual' });
      expect(await find(main.id, 'mk-field', true)).toMatchObject({ spamReason: 'manual' });
      const normal = await find(main.id, 'mk-normal', false);
      expect(
        (
          await request(server)
            .post(spamUrl(main.id, normal.id))
            .set(auth)
            .send({ spam: true })
            .expect(200)
        ).body,
      ).toMatchObject({ spam: true, spamReason: 'manual' });
      for (const id of [flagged.id, normal.id]) {
        const back = await request(server)
          .post(spamUrl(main.id, id))
          .set(auth)
          .send({ spam: false })
          .expect(200);
        expect(back.body).toMatchObject({ id, spam: false, spamReason: null });
      }
      // Saying what it already is changes nothing.
      await request(server)
        .post(spamUrl(main.id, flagged.id))
        .set(auth)
        .send({ spam: false })
        .expect(200);
      await barrier('mk-barrier');
      expect(emailed('mk-field')).toBe(1);
      expect(hooked('mk-field')).toBe(1);
      expect(emailed('mk-normal')).toBe(1);
      expect(hooked('mk-normal')).toBe(1);

      // Unknown submission, one of another form, a bad body, no session.
      await request(server)
        .post(spamUrl(main.id, randomUUID()))
        .set(auth)
        .send({ spam: true })
        .expect(404);
      const other = await newForm('Other');
      await request(server)
        .post(spamUrl(other.id, normal.id))
        .set(auth)
        .send({ spam: true })
        .expect(404);
      await request(server)
        .post(spamUrl(main.id, normal.id))
        .set(auth)
        .send({ spam: 'yes' })
        .expect(400);
      await request(server).post(spamUrl(main.id, normal.id)).send({ spam: true }).expect(401);
    });

    it("doesn't count spam towards the month and is accepted over the limit, up to 1,000 kept", async () => {
      // A flood of spam doesn't use the team's submissions: a normal post still gets in.
      await prisma.cloudFormSubmission.createMany({
        data: Array.from({ length: 1000 }, () => ({
          formId: main.id,
          data: [['filler', 'x']],
          email: 'filler-spam@example.com',
          spam: true,
          spamReason: 'markup',
        })),
      });
      await send(main.key, { message: 'mk-not-counted' }).expect(200);
      await vi.waitFor(() => expect(emailed('mk-not-counted')).toBe(1));
      // Past 1,000 spam a form drops new spam (still a success).
      const before = (await formView(main.id))!.spam;
      expect(before).toBeGreaterThanOrEqual(1000);
      expect((await send(main.key, { message: 'mk-dropped [/url]' }).expect(200)).body).toEqual({
        ok: true,
      });
      expect((await formView(main.id))!.spam).toBe(before);
      await prisma.cloudFormSubmission.deleteMany({
        where: { formId: main.id, email: 'filler-spam@example.com' },
      });

      // Over the month's limit a normal post is refused, spam is still answered and kept.
      await prisma.cloudFormSubmission.createMany({
        data: Array.from({ length: 1000 }, () => ({
          formId: main.id,
          data: [['filler', 'x']],
          email: 'filler-normal@example.com',
        })),
      });
      await send(main.key, { message: 'mk-over' }).expect(429);
      const res = await send(main.key, { message: 'mk-late [url=http://a.example]x[/url]' }).expect(
        200,
      );
      expect(res.body).toEqual({ ok: true });
      expect(await find(main.id, 'mk-late', true)).toMatchObject({ spamReason: 'markup' });
      await prisma.cloudFormSubmission.deleteMany({
        where: { formId: main.id, email: 'filler-normal@example.com' },
      });
      // Not spam brings it back into the count of the month it was received.
      const late = await find(main.id, 'mk-late', true);
      const inboxBefore = (await formView(main.id))!.submissions;
      await request(app.getHttpServer())
        .post(`${base}/${main.id}/submissions/${late.id}/spam`)
        .set(auth)
        .send({ spam: false })
        .expect(200);
      await vi.waitFor(() => expect(emailed('mk-late')).toBe(1));
      expect((await formView(main.id))!.submissions).toBe(inboxBefore + 1);
    });

    it('deletes spam after 30 days and keeps normal submissions for 180', async () => {
      const at = (days: number) => new Date(Date.now() - days * 86_400_000);
      const row = (email: string, days: number, spam: boolean) => ({
        formId: main.id,
        data: [['message', 'mk-old']],
        email,
        spam,
        spamReason: spam ? 'links' : null,
        createdAt: at(days),
      });
      await prisma.cloudFormSubmission.createMany({
        data: [
          row('old-spam@example.com', 31, true),
          row('recent-spam@example.com', 29, true),
          row('old-normal@example.com', 31, false),
        ],
      });
      await app.get(CloudFormsService).cleanup();
      const left = await prisma.cloudFormSubmission.findMany({
        where: { formId: main.id, email: { endsWith: '-spam@example.com' } },
        select: { email: true },
      });
      expect(left.map((s) => s.email)).toEqual(['recent-spam@example.com']);
      expect(
        await prisma.cloudFormSubmission.count({
          where: { formId: main.id, email: 'old-normal@example.com' },
        }),
      ).toBe(1);
    });
  });
});
