import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { AppModule } = await import('../src/app.module.js');
const { configureApp } = await import('../src/app.setup.js');
const { Role } = await import('../src/generated/prisma/client.js');
const { CLOUD_TERMS_VERSION } = await import('../src/modules/cloud/cloud-plans.js');
const { CloudStatusSubscribersService } =
  await import('../src/modules/cloud/cloud-status-subscribers.service.js');
const { MailService } = await import('../src/modules/mail/mail.service.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');

const tag = randomUUID().slice(0, 8);
const password = 'cloud-subscribers-password-1';
const owner = { email: `e2e-cs-owner-${tag}@codeqlick.test`, password };
const member = { email: `e2e-cs-member-${tag}@codeqlick.test`, password };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let ipCount = 0;
/** A new client address per sign-up, so the 5/min/IP limit doesn't get in the way. */
const ip = () => `198.51.100.${(ipCount++ % 250) + 1}`;

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

type Mail = { to: string; subject: string; text: string; listUnsubscribe?: string };

describe('Codeqlick Cloud status page email subscriptions (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: InstanceType<typeof PrismaService>;
  let jobs: InstanceType<typeof CloudStatusSubscribersService>;
  const sent: Mail[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jobs = app.get(CloudStatusSubscribersService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message as Mail);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const [person, name] of [
      [owner, 'Ada'],
      [member, 'Grace'],
    ] as const) {
      await prisma.user.create({
        data: {
          email: person.email,
          name,
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: { endsWith: `-${tag}` } } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const login = async (person: { email: string; password: string }) => {
    const res = await request(server()).post('/v1/auth/login').send(person).expect(200);
    return { Authorization: `Bearer ${res.body.accessToken as string}` };
  };
  const signUp = (team: string, email: string, locale: 'en' | 'es' = 'en') =>
    request(server())
      .post(`/v1/cloud/status/${team}/subscribers`)
      .set('X-Forwarded-For', ip())
      .send({ email, locale, acceptPrivacy: true });
  const mailsTo = (email: string) => sent.filter((mail) => mail.to === email);
  const confirmToken = (email: string) => {
    const mail = mailsTo(email).findLast((m) => m.text.includes('/status-updates/confirm?token='));
    return /confirm\?token=([\w-]+)/.exec(mail!.text)![1]!;
  };

  /** A team with a monitor on an enabled page; returns its slug, id and the owner's auth. */
  async function setup(slug: string) {
    const auth = await login(owner);
    const team = `${slug}-${tag}`;
    const created = await request(server())
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Acme', slug: team, acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(201);
    const ownerRow = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
    const monitor = await request(server())
      .post(`/v1/cloud/teams/${team}/monitors`)
      .set(auth)
      .send({
        kind: 'HEARTBEAT',
        name: 'API',
        periodMinutes: 60,
        graceMinutes: 10,
        alertIds: [ownerRow.id],
      })
      .expect(201);
    const pageBody = {
      enabled: true,
      title: 'Acme status',
      items: [{ monitorId: monitor.body.id as string, label: 'Public API' }],
    };
    await request(server())
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send(pageBody)
      .expect(200);
    return {
      auth,
      team,
      teamId: created.body.id as string,
      monitorId: monitor.body.id as string,
      pageBody,
    };
  }

  it('subscribes with double opt-in, emails notices and unsubscribes in one click', async () => {
    const { auth, team, teamId, monitorId, pageBody } = await setup('subs');
    const ada = `ada-${tag}@example.com`;
    const bob = `bob-${tag}@example.com`;

    // Off by default: no form, sign-ups refused.
    let status = await request(server()).get(`/v1/cloud/status/${team}`).expect(200);
    expect(status.body.subscribe).toBe(false);
    expect(status.body.teamName).toBe('Acme');
    await signUp(team, ada).expect(404);

    // A member can't switch it on; the owner can (team event).
    const memberRow = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    await prisma.cloudMember.create({
      data: {
        teamId,
        userId: memberRow.id,
        role: 'MEMBER',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });
    const memberAuth = await login(member);
    await request(server())
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(memberAuth)
      .send({ ...pageBody, subscriptions: true })
      .expect(403);
    const saved = await request(server())
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send({ ...pageBody, subscriptions: true })
      .expect(200);
    expect(saved.body.subscriptions).toBe(true);
    // Omitted keeps it.
    const kept = await request(server())
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send(pageBody)
      .expect(200);
    expect(kept.body.subscriptions).toBe(true);
    expect(
      await prisma.cloudEvent.count({ where: { teamId, action: 'status_subscribers.enabled' } }),
    ).toBe(1);

    // Sign-up: 202, a pending row, a confirmation link in the page's language.
    await signUp(team, ada.toUpperCase()).expect(202);
    await signUp(team, bob, 'es').expect(202);
    await signUp(team, `x-${tag}@mailinator.com`).expect(400);
    await flush();
    expect(mailsTo(ada)).toHaveLength(1);
    expect(mailsTo(ada)[0]!.subject).toBe('Confirm your subscription to Acme status');
    expect(mailsTo(bob)[0]!.subject).toBe('Confirma tu suscripción a Acme status');
    expect(mailsTo(ada)[0]!.listUnsubscribe).toBeUndefined();
    const adaRow = await prisma.cloudStatusSubscriber.findUniqueOrThrow({
      where: { teamId_email: { teamId, email: ada } },
    });
    expect(adaRow.status).toBe('PENDING');
    // Asking again within 10 minutes sends nothing more.
    await signUp(team, ada).expect(202);
    await flush();
    expect(mailsTo(ada)).toHaveLength(1);

    // Confirming takes the button's POST.
    await request(server())
      .post('/v1/cloud/status-subscribers/confirm')
      .send({ token: 'nope' })
      .expect(400);
    const confirmed = await request(server())
      .post('/v1/cloud/status-subscribers/confirm')
      .send({ token: confirmToken(ada) })
      .expect(200);
    expect(confirmed.body).toEqual({ teamName: 'Acme', teamSlug: team, locale: 'en' });
    // An active address is sent nothing more.
    await signUp(team, ada).expect(202);
    await flush();
    expect(mailsTo(ada)).toHaveLength(1);

    // A notice: written to the outbox with the post, emailed by the job to the active only.
    const notice = await request(server())
      .post(`/v1/cloud/teams/${team}/status-notices`)
      .set(auth)
      .send({
        kind: 'INCIDENT',
        title: 'Slow API',
        monitorIds: [monitorId],
        body: 'We are looking into it.',
      })
      .expect(201);
    const noticeId = notice.body.id as string;
    expect(await prisma.cloudStatusDispatch.count({ where: { noticeId } })).toBe(1);
    await jobs.tick();
    const incidentMail = mailsTo(ada).at(-1)!;
    expect(incidentMail.subject).toBe('[Acme status] Incident: Slow API');
    expect(incidentMail.text).toContain('We are looking into it.');
    expect(incidentMail.text).toContain('Public API');
    expect(incidentMail.text).toContain('/status-updates/unsubscribe?token=');
    expect(incidentMail.listUnsubscribe).toContain('/cloud/status-subscribers/unsubscribe/');
    expect(mailsTo(bob)).toHaveLength(1); // still pending: only the confirmation
    const dispatch = await prisma.cloudStatusDispatch.findFirstOrThrow({ where: { noticeId } });
    expect(dispatch.completedAt).not.toBeNull();
    expect(dispatch.sent).toBe(1);
    // Running again sends nothing twice.
    const before = sent.length;
    await jobs.tick();
    expect(sent.length).toBe(before);

    // Editing a notice sends nothing; an update sends UPDATE; resolving sends RESOLVED.
    await request(server())
      .patch(`/v1/cloud/status-notices/${noticeId}`)
      .set(auth)
      .send({ title: 'Slow public API' })
      .expect(200);
    expect(await prisma.cloudStatusDispatch.count({ where: { noticeId } })).toBe(1);
    await request(server())
      .post(`/v1/cloud/status-notices/${noticeId}/updates`)
      .set(auth)
      .send({ body: 'Found it.', state: 'IDENTIFIED' })
      .expect(201);
    await request(server())
      .post(`/v1/cloud/status-notices/${noticeId}/updates`)
      .set(auth)
      .send({ body: 'Fixed.', state: 'RESOLVED' })
      .expect(201);
    await jobs.tick();
    const subjects = mailsTo(ada).map((mail) => mail.subject);
    expect(subjects).toContain('[Acme status] Update: Slow public API');
    expect(subjects).toContain('[Acme status] Resolved: Slow public API');

    // A raw monitor change sends nothing to subscribers.
    const beat = await prisma.cloudMonitor.findUniqueOrThrow({ where: { id: monitorId } });
    await request(server()).get(`/v1/cloud/heartbeats/${beat.key}?status=fail`).expect(200);
    await jobs.tick();
    expect(
      mailsTo(ada).every(
        (mail) => mail.subject.startsWith('[Acme status]') || mail.subject.startsWith('Confirm'),
      ),
    ).toBe(true);
    expect(await prisma.cloudStatusDispatch.count({ where: { teamId, completedAt: null } })).toBe(
      0,
    );

    // A maintenance: NOTICE when scheduled, MAINTENANCE_STARTED once it starts (once).
    const start = new Date(Date.now() + 2 * HOUR);
    const maintenance = await request(server())
      .post(`/v1/cloud/teams/${team}/status-notices`)
      .set(auth)
      .send({
        kind: 'MAINTENANCE',
        title: 'Database upgrade',
        monitorIds: [monitorId],
        body: 'Short downtime.',
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + HOUR).toISOString(),
      })
      .expect(201);
    await jobs.tick();
    expect(mailsTo(ada).at(-1)!.subject).toBe(
      '[Acme status] Scheduled maintenance: Database upgrade',
    );
    const later = new Date(start.getTime() + MINUTE);
    await jobs.tick(later);
    await jobs.tick(later);
    const started = mailsTo(ada).filter((mail) => mail.subject.includes('Maintenance started'));
    expect(started).toHaveLength(1);
    expect(started[0]!.text).toContain('Short downtime.');
    const startedRow = await prisma.cloudStatusNotice.findUniqueOrThrow({
      where: { id: maintenance.body.id as string },
    });
    expect(startedRow.startNotifiedAt).not.toBeNull();

    // One-click unsubscribe from the header's address; the GET only redirects.
    const token = adaRow.unsubscribeToken;
    const redirect = await request(server())
      .get(`/v1/cloud/status-subscribers/unsubscribe/${token}`)
      .expect(302);
    expect(redirect.headers.location).toContain(`/en/status-updates/unsubscribe?token=${token}`);
    expect(
      (await prisma.cloudStatusSubscriber.findUniqueOrThrow({ where: { id: adaRow.id } })).status,
    ).toBe('ACTIVE');
    await request(server())
      .post(`/v1/cloud/status-subscribers/unsubscribe/${token}`)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(200);
    await request(server())
      .post('/v1/cloud/status-subscribers/unsubscribe')
      .send({ token })
      .expect(200);
    await request(server())
      .post('/v1/cloud/status-subscribers/unsubscribe')
      .send({ token: 'unknown' })
      .expect(404);
    const gone = await prisma.cloudStatusSubscriber.findUniqueOrThrow({ where: { id: adaRow.id } });
    expect(gone.status).toBe('UNSUBSCRIBED');
    const count = mailsTo(ada).length;
    await request(server())
      .post(`/v1/cloud/status-notices/${maintenance.body.id as string}/updates`)
      .set(auth)
      .send({ body: 'Going well.' })
      .expect(201);
    await jobs.tick(later);
    expect(mailsTo(ada)).toHaveLength(count);

    // Console: ADMIN only, masked addresses, delete one (event with the id only).
    await request(server())
      .get(`/v1/cloud/teams/${team}/status-subscribers`)
      .set(memberAuth)
      .expect(403);
    const list = await request(server())
      .get(`/v1/cloud/teams/${team}/status-subscribers`)
      .set(auth)
      .expect(200);
    expect(list.body.counts).toEqual({ active: 0, pending: 1, unsubscribed: 1 });
    expect(list.body.limit).toBe(500);
    expect(list.body.items.total).toBe(2);
    const emails = (list.body.items.items as Array<{ email: string }>).map((item) => item.email);
    expect(emails).toContain('a***@e***.com');
    expect(JSON.stringify(list.body)).not.toContain(ada);
    const pendingOnly = await request(server())
      .get(`/v1/cloud/teams/${team}/status-subscribers?status=PENDING`)
      .set(auth)
      .expect(200);
    expect(pendingOnly.body.items.total).toBe(1);
    await request(server())
      .delete(`/v1/cloud/teams/${team}/status-subscribers/${adaRow.id}`)
      .set(memberAuth)
      .expect(403);
    await request(server())
      .delete(`/v1/cloud/teams/${team}/status-subscribers/${adaRow.id}`)
      .set(auth)
      .expect(204);
    await request(server())
      .delete(`/v1/cloud/teams/${team}/status-subscribers/${adaRow.id}`)
      .set(auth)
      .expect(404);
    const event = await prisma.cloudEvent.findFirstOrThrow({
      where: { teamId, action: 'status_subscriber.deleted' },
    });
    expect(event.targetLabel).toBe(adaRow.id);
    expect(JSON.stringify(event)).not.toContain('example.com');
    const all = await request(server())
      .delete(`/v1/cloud/teams/${team}/status-subscribers`)
      .set(auth)
      .expect(200);
    expect(all.body).toEqual({ deleted: 1 });

    // Switching it off: sign-ups refused, open dispatches dropped unsent.
    await signUp(team, `carol-${tag}@example.com`).expect(202);
    await request(server())
      .post('/v1/cloud/status-subscribers/confirm')
      .send({ token: confirmToken(`carol-${tag}@example.com`) })
      .expect(200);
    await request(server())
      .post(`/v1/cloud/status-notices/${noticeId}/updates`)
      .set(auth)
      .send({ body: 'Back again.', state: 'INVESTIGATING' })
      .expect(201);
    await request(server())
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send({ ...pageBody, subscriptions: false })
      .expect(200);
    expect(
      await prisma.cloudEvent.count({ where: { teamId, action: 'status_subscribers.disabled' } }),
    ).toBe(1);
    await signUp(team, `dave-${tag}@example.com`).expect(404);
    await jobs.tick();
    expect(mailsTo(`carol-${tag}@example.com`)).toHaveLength(1); // the confirmation only
    expect(await prisma.cloudStatusDispatch.count({ where: { teamId, completedAt: null } })).toBe(
      0,
    );
    status = await request(server()).get(`/v1/cloud/status/${team}`).expect(200);
    expect(status.body.subscribe).toBe(false);
  });

  it('caps subscribers per plan and an hour of emails per team', async () => {
    const { auth, team, teamId, monitorId, pageBody } = await setup('cap');
    await request(server())
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send({ ...pageBody, subscriptions: true })
      .expect(200);
    // 500 active subscribers (the FREE cap), confirmed an hour ago.
    const confirmedAt = new Date(Date.now() - HOUR);
    await prisma.cloudStatusSubscriber.createMany({
      data: Array.from({ length: 500 }, (_, index) => ({
        teamId,
        email: `s${index}-${tag}@example.com`,
        locale: 'EN' as const,
        status: 'ACTIVE' as const,
        confirmedAt,
        unsubscribeToken: `cap-${tag}-${index}`,
      })),
    });
    app.get(CloudStatusSubscribersService).signups.reset();
    const status = await request(server()).get(`/v1/cloud/status/${team}`).expect(200);
    expect(status.body.subscribe).toBe(false);
    await signUp(team, `new-${tag}@example.com`).expect(409);
    // An address already there may still ask again.
    await signUp(team, `s0-${tag}@example.com`).expect(202);

    // PRO raises the cap.
    await prisma.cloudTeam.update({ where: { id: teamId }, data: { plan: 'PRO' } });
    await signUp(team, `new-${tag}@example.com`).expect(202);
    await prisma.cloudTeam.update({ where: { id: teamId }, data: { plan: 'FREE' } });

    // The hourly cap (FREE 1,000): with 990 used, a notice reaches 10 now, the rest later.
    await prisma.cloudStatusPage.update({
      where: { teamId },
      data: { emailWindowStart: new Date(), emailsInWindow: 990 },
    });
    const notice = await request(server())
      .post(`/v1/cloud/teams/${team}/status-notices`)
      .set(auth)
      .send({ kind: 'INCIDENT', title: 'Down', monitorIds: [monitorId], body: 'Down.' })
      .expect(201);
    const before = sent.length;
    await jobs.tick();
    expect(sent.length - before).toBe(10);
    let dispatch = await prisma.cloudStatusDispatch.findFirstOrThrow({
      where: { noticeId: notice.body.id as string },
    });
    expect(dispatch.completedAt).toBeNull();
    expect(dispatch.sent).toBe(10);
    // Next hour: the run sends its 400, the next one the rest.
    const nextHour = new Date(Date.now() + HOUR + MINUTE);
    await jobs.tick(nextHour);
    await jobs.tick(nextHour);
    dispatch = await prisma.cloudStatusDispatch.findFirstOrThrow({ where: { id: dispatch.id } });
    expect(dispatch.sent).toBe(500);
    expect(dispatch.completedAt).not.toBeNull();
    expect(sent.length - before).toBe(500);
    const recipients = new Set(sent.slice(before).map((mail) => mail.to));
    expect(recipients.size).toBe(500);

    // Sign-ups per team are limited to 60 an hour, whatever the address.
    const limiter = app.get(CloudStatusSubscribersService).signups;
    limiter.reset();
    for (let i = 0; i < 60; i++) limiter.take(teamId);
    await signUp(team, `late-${tag}@example.com`).expect(429);
    limiter.reset();
  });

  it('asks every member to accept the new Cloud terms, and deletes subscribers with the team', async () => {
    const { auth, team, teamId, pageBody } = await setup('terms');
    await request(server())
      .put(`/v1/cloud/teams/${team}/status-page`)
      .set(auth)
      .send({ ...pageBody, subscriptions: true })
      .expect(200);
    await signUp(team, `erin-${tag}@example.com`).expect(202);

    let me = await request(server()).get('/v1/cloud/me').set(auth).expect(200);
    expect(me.body.termsVersion).toBe(CLOUD_TERMS_VERSION);
    expect(me.body.termsAccepted).toBe(true);
    await prisma.cloudMember.updateMany({
      where: { teamId },
      data: { termsVersion: '2026-11-13' },
    });
    me = await request(server()).get('/v1/cloud/me').set(auth).expect(200);
    expect(me.body.termsAccepted).toBe(false);
    await request(server())
      .post('/v1/cloud/terms/accept')
      .set(auth)
      .send({ acceptTerms: true, termsVersion: '2026-11-13' })
      .expect(409);
    await request(server())
      .post('/v1/cloud/terms/accept')
      .set(auth)
      .send({ acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION })
      .expect(204);
    me = await request(server()).get('/v1/cloud/me').set(auth).expect(200);
    expect(me.body.termsAccepted).toBe(true);

    // The account export never carries the team's subscribers.
    const exported = await request(server()).get('/v1/auth/me/export').set(auth).expect(200);
    expect(JSON.stringify(exported.body)).not.toContain(`erin-${tag}`);

    // Deleting the team deletes its subscribers and dispatches, emailing no one.
    expect(await prisma.cloudStatusSubscriber.count({ where: { teamId } })).toBe(1);
    const before = sent.length;
    await request(server()).delete(`/v1/cloud/teams/${team}`).set(auth).expect(204);
    expect(await prisma.cloudStatusSubscriber.count({ where: { teamId } })).toBe(0);
    expect(await prisma.cloudStatusDispatch.count({ where: { teamId } })).toBe(0);
    expect(sent.length).toBe(before);
  });
});
