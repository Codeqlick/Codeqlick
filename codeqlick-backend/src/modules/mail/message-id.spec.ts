import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';

describe('outgoing email headers (decision 109)', () => {
  it('gives every message a Message-ID in the sending domain', async () => {
    const transport = createTransport({ streamTransport: true, buffer: true });
    const info = (await transport.sendMail({
      from: 'Codeqlick <hello@codeqlick.com>',
      to: 'ada@example.com',
      subject: 'Hi',
      text: 'Hi',
    })) as { message: Buffer };
    expect(info.message.toString()).toMatch(/^Message-ID: <[0-9a-f-]+@codeqlick\.com>$/m);
  });
});
