import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from './mail.service.js';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_options: unknown) => ({})) }));

vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

const config = {
  mailFrom: 'Codeqlick <hello@codeqlick.com>',
  mailOutboxDir: undefined,
  isTest: true,
  smtp: { host: 'localhost', port: 1025, secure: false },
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
});
