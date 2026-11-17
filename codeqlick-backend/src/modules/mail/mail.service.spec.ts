import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import { MailService, mailAddress, mailDomain } from './mail.service.js';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_options: unknown) => ({})) }));

vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

const config = {
  mailFrom: 'Codeqlick <hello@codeqlick.com>',
  mailOutboxDir: undefined,
  isTest: true,
  smtp: { host: 'localhost', port: 1025, secure: false },
  neoqlickMail: {},
} as unknown as AppConfigService;

describe('MailService', () => {
  beforeEach(() => sendMail.mockClear());

  it('adds the RFC 8058 one-click unsubscribe headers to an optional email', async () => {
    const url = 'https://api.codeqlick.com/v1/email/unsubscribe?token=abc.def';
    await new MailService(config).send({
      to: 'ada@example.com',
      subject: 'Your weekly summary',
      text: 'Hi',
      listUnsubscribe: url,
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        headers: {
          'List-Unsubscribe': `<${url}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    );
  });

  it('sends transactional emails without them', async () => {
    await new MailService(config).send({ to: 'ada@example.com', subject: 'Reset', text: 'Hi' });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ headers: undefined }));
  });

  it('greets the SMTP server with the sending domain', () => {
    expect(mailDomain('Codeqlick <hello@codeqlick.com>')).toBe('codeqlick.com');
    expect(mailDomain('hello@Codeqlick.com')).toBe('codeqlick.com');
    expect(mailDomain('no address')).toBeUndefined();
  });
});

describe('MailService and Neoqlick (architecture 4.18, decision 128)', () => {
  beforeEach(() => sendMail.mockClear());

  const neoConfig = (neoqlickMail: object) =>
    ({ ...config, neoqlickMail, isTest: true }) as unknown as AppConfigService;

  it("sends a Neoqlick message from Neoqlick's sender, replying to it, and in its words", async () => {
    await new MailService(neoConfig({ from: 'Neoqlick <hello@neoqlick.com>' })).send({
      to: 'ada@example.com',
      brand: 'neoqlick',
      subject: 'Confirm your email — Codeqlick',
      text: 'Hi',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Neoqlick <hello@neoqlick.com>',
        replyTo: 'hello@neoqlick.com',
        subject: 'Confirm your email — Neoqlick',
      }),
    );
  });

  it("keeps a Codeqlick message on Codeqlick's sender even when Neoqlick's exists", async () => {
    await new MailService(neoConfig({ from: 'Neoqlick <hello@neoqlick.com>' })).send({
      to: 'ada@example.com',
      subject: 'Reset — Codeqlick',
      text: 'Hi',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Codeqlick <hello@codeqlick.com>',
        subject: 'Reset — Codeqlick',
        replyTo: undefined,
      }),
    );
  });

  it("works with Neoqlick's mailbox unset: Neoqlick as the name, the default address, no reply-to", async () => {
    await new MailService(neoConfig({})).send({
      to: 'ada@example.com',
      brand: 'neoqlick',
      subject: 'Hi',
      text: 'Hi',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Neoqlick <hello@codeqlick.com>', replyTo: undefined }),
    );
  });

  it('keeps an explicit reply-to', async () => {
    await new MailService(neoConfig({ from: 'Neoqlick <hello@neoqlick.com>' })).send({
      to: 'ada@example.com',
      brand: 'neoqlick',
      subject: 'Hi',
      text: 'Hi',
      replyTo: 'someone@example.com',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'someone@example.com' }),
    );
  });

  it('takes the address out of a From', () => {
    expect(mailAddress('Neoqlick <hello@neoqlick.com>')).toBe('hello@neoqlick.com');
    expect(mailAddress('hello@neoqlick.com')).toBe('hello@neoqlick.com');
  });
});
