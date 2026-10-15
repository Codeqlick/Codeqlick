import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Locale, Role, type Prisma } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'bookings-password-1';
const admin = { email: `e2e-bookings-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-bookings-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-bookings-other-${tag}@codeqlick.test`, password };

describe('Booked calls (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const ids: Record<string, string> = {};
  let saved: Prisma.InputJsonValue | null = null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    saved =
      ((await prisma.setting.findUnique({ where: { key: 'booking' } }))
        ?.value as Prisma.InputJsonValue) ?? null;
    await prisma.setting.deleteMany({ where: { key: 'booking' } });
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
      // The calculator is one shared setting: put back whatever was there.
      if (saved === null) await prisma.setting.deleteMany({ where: { key: 'booking' } });
      else await prisma.setting.update({ where: { key: 'booking' }, data: { value: saved } });
      await prisma.booking.deleteMany({ where: { email: { endsWith: '@booking.test' } } });
      await prisma.lead.deleteMany({ where: { email: { endsWith: '@booking.test' } } });
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

  it('offers free slots, books one with invitations for both sides and lets either cancel it', async () => {
    const server = app.getHttpServer();
    const adminAuth = {
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(admin).expect(200)).body.accessToken as string}`,
    };
    await request(server).get('/v1/bookings/slots').expect(404);
    const defaults = await request(server)
      .get('/v1/admin/booking-settings')
      .set(adminAuth)
      .expect(200);
    expect(defaults.body).toMatchObject({
      enabled: false,
      durationMinutes: 30,
      minNoticeHours: 24,
    });
    await request(server)
      .put('/v1/admin/booking-settings')
      .set(adminAuth)
      .send({ ...defaults.body, enabled: true })
      .expect(400);
    const everyDay = [{ start: '09:00', end: '18:00' }];
    await request(server)
      .put('/v1/admin/booking-settings')
      .set(adminAuth)
      .send({
        ...defaults.body,
        enabled: true,
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        minNoticeHours: 0,
        horizonDays: 7,
        weekly: {
          mon: everyDay,
          tue: everyDay,
          wed: everyDay,
          thu: everyDay,
          fri: everyDay,
          sat: everyDay,
          sun: everyDay,
        },
      })
      .expect(200);

    const slots = await request(server).get('/v1/bookings/slots').expect(200);
    expect(slots.body).toMatchObject({ durationMinutes: 30, timeZone: 'Europe/Madrid' });
    expect(slots.body.slots.length).toBeGreaterThan(10);
    const startsAt = slots.body.slots[3] as string;

    // A wrong time is refused; a free one is booked.
    await request(server)
      .post('/v1/bookings')
      .send({
        name: 'Ana',
        email: 'ana@booking.test',
        locale: 'es',
        startsAt: '2020-01-01T10:00:00.000Z',
      })
      .expect(409);
    const before = sent.length;
    const booked = await request(server)
      .post('/v1/bookings')
      .send({
        name: 'Ana Pérez',
        email: 'Ana@Booking.test',
        company: 'Clínica Sol',
        message: 'Queremos una app de citas.',
        locale: 'es',
        startsAt,
      })
      .expect(201);
    expect(booked.body).toMatchObject({
      startsAt,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
    await vi.waitFor(() => expect(sent.length).toBe(before + 2));
    const [toVisitor, toTeam] = [
      sent.slice(before).find((m) => m.to === 'ana@booking.test')!,
      sent.slice(before).find((m) => m.to !== 'ana@booking.test')!,
    ];
    expect(toVisitor.subject).toMatch(/^Llamada con Codeqlick: /);
    expect(toVisitor.text).toContain('https://meet.google.com/abc-defg-hij');
    expect(toVisitor.icalEvent).toMatchObject({ method: 'REQUEST' });
    expect(toVisitor.icalEvent?.content).toContain('ATTENDEE;CN=Ana Pérez');
    expect(toTeam).toMatchObject({ replyTo: 'ana@booking.test' });
    expect(toTeam.subject).toMatch(/^Call booked: Ana Pérez/);

    // The slot is gone, a second booking of it is refused, and the lead waits for the call.
    const after = await request(server).get('/v1/bookings/slots').expect(200);
    expect(after.body.slots).not.toContain(startsAt);
    await request(server)
      .post('/v1/bookings')
      .send({ name: 'Otro', email: 'otro@booking.test', locale: 'en', startsAt })
      .expect(409);
    const lead = await prisma.lead.findFirst({ where: { email: 'ana@booking.test' } });
    expect(lead).toMatchObject({ status: 'CALL', company: 'Clínica Sol' });
    const stats = await request(server).get('/v1/admin/stats').set(adminAuth).expect(200);
    expect(stats.body.bookings.upcoming).toBeGreaterThanOrEqual(1);

    // The visitor cancels from the link in their email: the team is told, the slot is free again.
    const token = /token=([\w-]+)/.exec(toVisitor.text)?.[1];
    expect(token).toBeDefined();
    await request(server)
      .post('/v1/bookings/cancel')
      .send({ token: 'x'.repeat(20) })
      .expect(404);
    await request(server).post('/v1/bookings/cancel').send({ token }).expect(200);
    await vi.waitFor(() => expect(sent.at(-1)?.icalEvent?.method).toBe('CANCEL'));
    expect(sent.at(-1)?.subject).toMatch(/^Call cancelled: /);
    await request(server).post('/v1/bookings/cancel').send({ token }).expect(404);
    const freed = await request(server).get('/v1/bookings/slots').expect(200);
    expect(freed.body.slots).toContain(startsAt);

    // Booked again, then cancelled by the team: the visitor is told in Spanish.
    const again = await request(server)
      .post('/v1/bookings')
      .send({ name: 'Ana Pérez', email: 'ana@booking.test', locale: 'es', startsAt })
      .expect(201);
    const list = await request(server).get('/v1/admin/bookings').set(adminAuth).expect(200);
    expect(list.body.map((b: { id: string }) => b.id)).toContain(again.body.id);
    await request(server)
      .post(`/v1/admin/bookings/${again.body.id as string}/cancel`)
      .set(adminAuth)
      .expect(200);
    await vi.waitFor(() => expect(sent.at(-1)?.subject).toMatch(/^Llamada cancelada: /));
    expect(sent.at(-1)?.to).toBe('ana@booking.test');
  });
});
