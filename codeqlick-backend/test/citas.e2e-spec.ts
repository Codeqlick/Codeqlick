import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { CitasService } from '../src/modules/citas/citas.service.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const tag = randomUUID().slice(0, 8);
const ALL_DAY = [{ start: '00:00', end: '23:30' }];
const WEEKLY = {
  mon: ALL_DAY,
  tue: ALL_DAY,
  wed: ALL_DAY,
  thu: ALL_DAY,
  fri: ALL_DAY,
  sat: ALL_DAY,
  sun: ALL_DAY,
};

describe('Citas (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: { id: string; auth: { Authorization: string } };
  const sent: MailMessage[] = [];
  let ip = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(MailService), 'send').mockImplementation(async (message) => {
      sent.push(message);
    });
    const email = `e2e-citas-owner-${tag}@codeqlick.test`;
    const user = await prisma.user.create({
      data: { email, name: 'Paula Peluquera', role: Role.CLIENT, passwordHash: 'x' },
    });
    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email, name: user.name, role: Role.CLIENT });
    owner = { id: user.id, auth: { Authorization: `Bearer ${token}` } };
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@codeqlick.test` } } });
    }
    await app?.close();
  });

  const server = () => app.getHttpServer();
  /** Each visitor comes from their own address (bookings are limited per IP). */
  const visitor = () => ({ 'X-Forwarded-For': `10.9.${tag.charCodeAt(0)}.${++ip}` });
  const page = (slug: string, extra: Record<string, unknown> = {}) => ({
    slug,
    title: 'Corte de pelo',
    description: 'Lavar, cortar y peinar.',
    durationMinutes: 30,
    location: 'Calle Mayor 1, Madrid',
    video: false,
    askPhone: false,
    timeZone: 'UTC',
    weekly: WEEKLY,
    minNoticeHours: 0,
    horizonDays: 3,
    enabled: true,
    ...extra,
  });
  const createPage = async (slug: string, extra: Record<string, unknown> = {}) =>
    (
      await request(server())
        .post('/v1/citas/pages')
        .set(owner.auth)
        .send(page(slug, extra))
        .expect(201)
    ).body as { id: string; slug: string; video: boolean; meetingCode: string | null };
  const slotsOf = async (slug: string) =>
    ((await request(server()).get(`/v1/citas/p/${slug}`).expect(200)).body as { slots: string[] })
      .slots;
  const book = (slug: string, startsAt: string, extra: Record<string, unknown> = {}) =>
    request(server())
      .post(`/v1/citas/p/${slug}/appointments`)
      .set(visitor())
      .send({ name: 'Ana Cliente', email: 'ana@example.com', locale: 'es', startsAt, ...extra });
  const tokenFrom = (message: MailMessage) => /token=([\w-]+)/.exec(message.text)?.[1] ?? '';

  it('creates a page with its own Meetings room, and keeps links unique and off reserved words', async () => {
    const created = await createPage(`pelu-${tag}`, { video: true });
    expect(created.video).toBe(true);
    expect(created.meetingCode).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);

    await request(server())
      .post('/v1/citas/pages')
      .set(owner.auth)
      .send(page(`pelu-${tag}`))
      .expect(409);
    await request(server())
      .post('/v1/citas/pages')
      .set(owner.auth)
      .send(page('editar'))
      .expect(400);
    await request(server())
      .post('/v1/citas/pages')
      .set(owner.auth)
      .send(page(`zona-${tag}`, { timeZone: 'Mars/Olympus' }))
      .expect(400);
    await request(server())
      .post('/v1/citas/pages')
      .send(page(`anon-${tag}`))
      .expect(401);

    const publicPage = (await request(server()).get(`/v1/citas/p/pelu-${tag}`).expect(200)).body;
    expect(publicPage).toMatchObject({
      title: 'Corte de pelo',
      ownerName: 'Paula Peluquera',
      video: true,
      timeZone: 'UTC',
      enabled: true,
    });
    expect(publicPage.slots.length).toBeGreaterThan(10);
  });

  it('books a free time once, emails both sides, and the owner is busy on all their pages', async () => {
    const slug = `uno-${tag}`;
    await createPage(slug);
    await createPage(`dos-${tag}`);
    const [first] = await slotsOf(slug);

    const booked = await book(slug, first!, { note: 'Solo puntas' }).expect(201);
    expect(booked.body).toMatchObject({
      title: 'Corte de pelo',
      status: 'CONFIRMED',
      startsAt: first,
    });
    expect(sent.map((message) => message.to).toSorted()).toEqual(
      ['ana@example.com', `e2e-citas-owner-${tag}@codeqlick.test`].toSorted(),
    );
    const toBooker = sent.find((message) => message.to === 'ana@example.com')!;
    expect(toBooker.icalEvent?.method).toBe('REQUEST');
    expect(toBooker.text).toContain('/es/cancelar?token=');

    await book(slug, first!).expect(409);
    // Same person, another of their pages, same time: not free either.
    await book(`dos-${tag}`, first!).expect(409);
    expect(await slotsOf(slug)).not.toContain(first);

    // A time that isn't one of the free ones.
    await book(slug, new Date(Date.parse(first!) + 60_000).toISOString()).expect(409);

    const list = (await request(server()).get('/v1/citas/appointments').set(owner.auth).expect(200))
      .body.items as Array<{ name: string; note: string; status: string }>;
    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Ana Cliente', note: 'Solo puntas', status: 'CONFIRMED' }),
      ]),
    );
  });

  it('cancels from the emailed link: the owner is told and the time is free again', async () => {
    const slug = `tres-${tag}`;
    await createPage(slug);
    const [, second] = await slotsOf(slug);
    await book(slug, second!).expect(201);
    const token = tokenFrom(sent.find((message) => message.to === 'ana@example.com')!);
    sent.length = 0;

    const preview = await request(server())
      .post('/v1/citas/cancel/preview')
      .send({ token })
      .expect(200);
    expect(preview.body).toMatchObject({ status: 'CONFIRMED', startsAt: second });

    const cancelled = await request(server()).post('/v1/citas/cancel').send({ token }).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(`e2e-citas-owner-${tag}@codeqlick.test`);
    expect(sent[0]!.icalEvent?.method).toBe('CANCEL');
    expect(await slotsOf(slug)).toContain(second);

    // Twice is harmless; a made-up link isn't found.
    await request(server()).post('/v1/citas/cancel').send({ token }).expect(200);
    await request(server())
      .post('/v1/citas/cancel')
      .send({ token: 'x'.repeat(32) })
      .expect(404);
  });

  it('lets the owner cancel, asks for a phone when the page wants one, and pauses pages', async () => {
    const slug = `cuatro-${tag}`;
    const created = await createPage(slug, { askPhone: true });
    const slots = await slotsOf(slug);
    const third = slots[2]!;

    await book(slug, third).expect(400);
    const booked = await book(slug, third, { phone: '+34 600 000 000' }).expect(201);
    sent.length = 0;
    const cancelled = await request(server())
      .post(`/v1/citas/appointments/${booked.body.id}/cancel`)
      .set(owner.auth)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(sent.map((message) => message.to)).toEqual(['ana@example.com']);

    await request(server())
      .patch(`/v1/citas/pages/${created.id}`)
      .set(owner.auth)
      .send({ enabled: false })
      .expect(200);
    expect(await slotsOf(slug)).toEqual([]);
    await book(slug, third, { phone: '+34 600 000 000' }).expect(409);
  });

  it('deletes a page after cancelling what was still to come', async () => {
    const slug = `cinco-${tag}`;
    const created = await createPage(slug);
    const slots = await slotsOf(slug);
    await book(slug, slots[3]!).expect(201);
    sent.length = 0;

    await request(server()).delete(`/v1/citas/pages/${created.id}`).set(owner.auth).expect(204);
    expect(sent.map((message) => message.to)).toEqual(['ana@example.com']);
    expect(sent[0]!.icalEvent?.method).toBe('CANCEL');
    await request(server()).get(`/v1/citas/p/${slug}`).expect(404);
  });
  it('reminds whoever booked about 24 h before, once, and skips fresh or cancelled bookings', async () => {
    const slug = `recuerdo-${tag}`;
    await createPage(slug, { video: true });
    const [a, b, c] = await slotsOf(slug);
    const ids: string[] = [];
    for (const [slot, email] of [
      [a, 'early@example.com'],
      [b, 'fresh@example.com'],
      [c, 'gone@example.com'],
    ] as const) {
      const booked = (await book(slug, slot!, { email }).expect(201)).body as { id: string };
      ids.push(booked.id);
    }
    const now = new Date();
    const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
    const longAgo = new Date(now.getTime() - 7 * 86_400_000);
    // Booked a week ago for 20 h from now, booked just now for 20 h from now, and cancelled.
    await prisma.appointment.update({
      where: { id: ids[0] },
      data: { startsAt: at(20), endsAt: at(20.5), createdAt: longAgo },
    });
    await prisma.appointment.update({
      where: { id: ids[1] },
      data: { startsAt: at(21), endsAt: at(21.5) },
    });
    await prisma.appointment.update({
      where: { id: ids[2] },
      data: { startsAt: at(22), endsAt: at(22.5), createdAt: longAgo, status: 'CANCELLED' },
    });
    sent.length = 0;

    const citas = app.get(CitasService);
    await citas.sendReminders(now);
    const reminders = sent.filter((message) => message.subject.startsWith('Recordatorio'));
    expect(reminders.map((message) => message.to)).toEqual(['early@example.com']);
    expect(reminders[0]!.text).toContain('Paula Peluquera');
    expect(reminders[0]!.text).toMatch(/meetings/);
    expect(reminders[0]!.replyTo).toBe(`e2e-citas-owner-${tag}@codeqlick.test`);

    sent.length = 0;
    await citas.sendReminders(now);
    expect(sent.filter((message) => message.subject.startsWith('Recordatorio'))).toHaveLength(0);
  });
});
