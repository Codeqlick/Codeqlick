import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Its own file, so its own app: login is limited to 5 per minute and per IP.
const tag = randomUUID().slice(0, 8);
const password = 'portal-site-password-1';
const admin = { email: `e2e-psite-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-psite-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-psite-other-${tag}@codeqlick.test`, password };

/** A preset as site-builder returns it (a demo's content, with the fields the API replaces). */
const preset = {
  demo: true,
  url: 'https://peluqueria.demo.codeqlick.com',
  form: { demo: true },
  footerNote: 'Web de demostración',
  business: {
    name: 'Alba Estudio',
    description: 'Peluquería en Triana.',
    schemaType: 'HairSalon',
  },
  theme: {
    primary: '#A84A33',
    primaryText: '#FFFFFF',
    background: '#FBF7F4',
    surface: '#F4ECE6',
    text: '#2A1F1C',
    muted: '#6B5A54',
    headingFont: 'playfair',
    bodyFont: 'inter',
    corners: 'round',
  },
  contact: { phone: '954 00 00 00' },
  hours: [{ days: 'Martes a viernes', hours: '9:30–20:00' }],
  openingHoursSpec: ['Tu-Fr 09:30-20:00'],
  hero: {
    title: 'Tu pelo, en las mejores manos',
    text: 'Cortes, color y peinados.',
    image: { file: 'hero.jpg', alt: 'Peluquera' },
    primary: { label: 'Pedir cita', href: '#contacto' },
  },
  contactSection: { title: 'Pide tu cita' },
  legal: { owner: 'Alba', taxId: '0', address: 'Sevilla', email: 'hola@alba.example' },
};

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Clients edit their website (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const builds: Array<{ content: Record<string, unknown> }> = [];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const builder = app.get(SiteBuilderClient);
    vi.spyOn(builder, 'presets').mockResolvedValue([{ key: 'peluqueria', content: preset }]);
    vi.spyOn(builder, 'build').mockImplementation((input) => {
      builds.push(input);
      return Promise.resolve({ ok: true, release: `r${builds.length}`, ms: 10 });
    });
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
        data: { email: client.email, name: 'Marta', role: Role.CLIENT, passwordHash },
      })
    ).id;
    await prisma.user.create({
      data: { email: other.email, name: 'Ada', role: Role.CLIENT, passwordHash },
    });
    ids.project = (
      await prisma.clientProject.create({
        data: { clientId: ids.client, name: 'Peluquería Marta' },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clientProject.deleteMany({ where: { clientId: ids.client! } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('lets the client change texts, hours and photos, and tells the team', async () => {
    const server = app.getHttpServer();
    const bearer = async (user: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(user).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await bearer(admin);
    const clientAuth = await bearer(client);
    const otherAuth = await bearer(other);
    const portal = `/v1/portal/projects/${ids.project}/site`;

    await request(server).get(portal).set(clientAuth).expect(404);
    await request(server)
      .post(`/v1/admin/projects/${ids.project}/site`)
      .set(adminAuth)
      .send({ slug: `marta-${tag}`, preset: 'peluqueria' })
      .expect(201);

    const site = await request(server).get(portal).set(clientAuth).expect(200);
    expect(site.body).toMatchObject({
      status: 'LIVE',
      editable: {
        hero: { title: 'Tu pelo, en las mejores manos' },
        contact: { phone: '954 00 00 00' },
      },
    });
    expect(site.body.editable).not.toHaveProperty('theme');
    await request(server).get(portal).set(otherAuth).expect(404);

    // A photo: JPEG/PNG/WebP only.
    await request(server)
      .post(`${portal}/images`)
      .set(clientAuth)
      .attach('file', Buffer.from('GIF89a......'), 'x.gif')
      .expect(400);
    const photo = await request(server)
      .post(`${portal}/images`)
      .set(clientAuth)
      .attach('file', PNG, 'foto.png')
      .expect(201);
    expect(photo.body.file).toMatch(/^media\/[\w-]+\.png$/);

    // The Google review link: only Google's.
    await request(server)
      .put(portal)
      .set(clientAuth)
      .send({
        site: {
          ...site.body.editable,
          contact: { ...site.body.editable.contact, reviewUrl: 'https://example.com/review' },
        },
      })
      .expect(400);
    const edits = {
      ...site.body.editable,
      contact: {
        ...site.body.editable.contact,
        reviewUrl: 'https://g.page/r/CdA1b2C3d4E5EAE/review',
      },
      hours: [{ days: 'Lunes a sábado', hours: '10:00–20:00' }],
      gallery: { title: 'Nuestro trabajo', images: [{ file: photo.body.file, alt: 'Un corte' }] },
    };
    await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ site: { ...edits, hero: { title: '', text: 'x' } } })
      .expect(400);
    const before = sent.length;
    const saved = await request(server)
      .put(portal)
      .set(clientAuth)
      .send({ site: edits })
      .expect(200);
    expect(saved.body.editable.hours).toEqual([{ days: 'Lunes a sábado', hours: '10:00–20:00' }]);
    const built = builds.at(-1)?.content as Record<string, unknown>;
    expect(built).not.toHaveProperty('openingHoursSpec');
    expect(built.theme).toMatchObject({ primary: '#A84A33' });
    expect(built.gallery).toMatchObject({ images: [{ file: photo.body.file }] });
    expect(built.contact).toMatchObject({ reviewUrl: 'https://g.page/r/CdA1b2C3d4E5EAE/review' });
    await vi.waitFor(() => expect(sent.length).toBe(before + 1));
    expect(sent.at(-1)?.subject).toBe('[codeqlick] Website changed: Peluquería Marta');
    expect(sent.at(-1)?.text).toContain('Opening hours, Gallery');

    // The team sees it as a revision by the client.
    const revisions = await request(server)
      .get(`/v1/admin/projects/${ids.project}/site/revisions`)
      .set(adminAuth)
      .expect(200);
    expect(revisions.body[0].author).toEqual({ name: 'Marta' });
    // Its photo is now in use: the media library won't delete it.
    await request(server)
      .delete(`/v1/admin/media/${(photo.body.file as string).slice('media/'.length)}`)
      .set(adminAuth)
      .expect(409);
  });
});
