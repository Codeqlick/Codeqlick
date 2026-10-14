import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityService } from '../activity/activity.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { Lead } from '../../generated/prisma/client.js';
import type { MailService } from '../mail/mail.service.js';
import type { LeadsRepository } from './leads.repository.js';
import type { CreateLeadInput } from './leads.schemas.js';
import { LeadsService } from './leads.service.js';

const input: CreateLeadInput = {
  name: 'Grace',
  email: 'Grace@Example.com',
  company: 'Navy',
  budget: '10k-25k',
  message: 'We need a web app for our team.',
  locale: 'es',
};

function leadRow(): Lead {
  return {
    id: 'c0ffee00-0000-4000-8000-000000000001',
    name: 'Grace',
    email: 'grace@example.com',
    company: 'Navy',
    budget: '10k-25k',
    message: 'We need a web app for our team.',
    locale: 'ES',
    status: 'NEW',
    notes: null,
    createdAt: new Date('2026-10-13T10:00:00Z'),
    updatedAt: new Date('2026-10-13T10:00:00Z'),
  } as Lead;
}

/** Lets fire-and-forget promise chains settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LeadsService', () => {
  let repository: { create: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: LeadsService;

  beforeEach(() => {
    repository = { create: vi.fn().mockResolvedValue(leadRow()) };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    const config = { leadsNotifyTo: 'hello@codeqlick.com' } as AppConfigService;
    service = new LeadsService(
      repository as unknown as LeadsRepository,
      mail as unknown as MailService,
      config,
      { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
    );
  });

  it('silently discards honeypot submissions', async () => {
    const result = await service.create({ ...input, website: 'http://spam.example' });

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('saves the lead and sends notification + acknowledgement emails', async () => {
    const result = await service.create(input);
    await flush();

    expect(result).toEqual({ id: leadRow().id });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'grace@example.com', locale: 'ES', company: 'Navy' }),
    );
    expect(mail.send).toHaveBeenCalledTimes(2);
    const recipients = mail.send.mock.calls.map((call) => (call[0] as { to: string }).to);
    expect(recipients).toContain('hello@codeqlick.com');
    expect(recipients).toContain('grace@example.com');

    const ack = mail.send.mock.calls
      .map((call) => call[0] as { to: string; subject: string })
      .find((message) => message.to === 'grace@example.com');
    expect(ack?.subject).toContain('Hemos recibido');
  });

  it('does not fail the request when sending mail fails', async () => {
    mail.send.mockRejectedValue(new Error('SMTP down'));

    await expect(service.create(input)).resolves.toEqual({ id: leadRow().id });
    await flush();
    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  it('does not fail the request when the mail service throws synchronously', async () => {
    mail.send.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(service.create(input)).resolves.toEqual({ id: leadRow().id });
  });
});
