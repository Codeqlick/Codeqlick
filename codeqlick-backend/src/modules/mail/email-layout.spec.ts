import { describe, expect, it } from 'vitest';
import { renderEmail } from './email-layout.js';

const siteUrl = 'https://codeqlick.com';

describe('renderEmail', () => {
  it('writes the text version in reading order with the bare link and the signature', () => {
    const { text } = renderEmail(
      {
        locale: 'es',
        preheader: 'Preview',
        title: 'Titular',
        greeting: 'Hola Ada:',
        intro: ['Primer párrafo.'],
        quote: { title: 'Título', body: 'Cuerpo' },
        button: { label: 'Abrir', url: 'https://codeqlick.com/es/x' },
        outro: ['Último párrafo.'],
        note: 'Nota.',
      },
      siteUrl,
    );
    expect(text).toBe(
      [
        'Titular',
        '',
        'Hola Ada:',
        '',
        'Primer párrafo.',
        '',
        'Título',
        '',
        'Cuerpo',
        '',
        'https://codeqlick.com/es/x',
        '',
        'Último párrafo.',
        '',
        'Nota.',
        '',
        'Un saludo,',
        'El equipo de Codeqlick',
      ].join('\n'),
    );
  });

  it('brands the HTML version: hosted logo, preheader, button and footer', () => {
    const { html } = renderEmail(
      {
        locale: 'en',
        preheader: 'Your account is ready',
        title: 'Welcome to Codeqlick',
        intro: ['Hello.'],
        note: 'The link expires in 7 days.',
        button: { label: 'Choose my password', url: 'https://codeqlick.com/en/reset?token=a&b=1' },
      },
      siteUrl,
    );
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('src="https://codeqlick.com/email/logo.png"');
    expect(html).toContain('Your account is ready</div>');
    expect(html).toContain('href="https://codeqlick.com/en/reset?token=a&amp;b=1"');
    expect(html).toContain('>Choose my password</a>');
    expect(html).toContain('Redefining information technology in society');
    expect(html).toContain('#D9177E');
    expect(html).toContain('>Welcome to Codeqlick</h1>');
    expect(html).toContain('The link expires in 7 days.</td>');
    expect(html).toContain(`© ${new Date().getFullYear()} Codeqlick`);
  });

  it('escapes everything that comes from users', () => {
    const { html } = renderEmail(
      {
        locale: 'en',
        preheader: '<b>pre</b>',
        title: 'New lead: <Ada>',
        greeting: 'Hi <script>alert(1)</script>,',
        intro: ['"quoted" & <i>tagged</i>'],
        quote: { body: 'line one\n<img src=x onerror=alert(1)>' },
        details: [['Name', "O'Brien <evil@x.com>"]],
      },
      siteUrl,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('New lead: &lt;Ada&gt;</h1>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<i>tagged</i>');
    expect(html).toContain('Hi &lt;script&gt;alert(1)&lt;/script&gt;,');
    expect(html).toContain('&quot;quoted&quot; &amp; &lt;i&gt;tagged&lt;/i&gt;');
    expect(html).toContain('line one<br>&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('O&#39;Brien &lt;evil@x.com&gt;');
  });

  it('links web addresses in the text, breakable on phones, leaving a final full stop out', () => {
    const { html } = renderEmail(
      {
        locale: 'es',
        preheader: 'Preview',
        intro: ['Mira https://codeqlick.com/es/x?a=1&b=2.'],
        note: 'Cancela aquí: https://codeqlick.com/es/book/cancel?token=abc',
      },
      siteUrl,
    );
    expect(html).toContain(
      'Mira <a href="https://codeqlick.com/es/x?a=1&amp;b=2" target="_blank" style="color:#D9177E;text-decoration:underline;word-break:break-all;">https://codeqlick.com/es/x?a=1&amp;b=2</a>.',
    );
    expect(html).toContain('href="https://codeqlick.com/es/book/cancel?token=abc"');
    expect(html).toContain('.cq-card { padding: 24px 20px !important; }');
  });

  it('links the unsubscribe page in the footer of an optional email, in its language', () => {
    const url = 'https://codeqlick.com/es/email/unsubscribe?token=abc.d_e';
    const { text, html } = renderEmail(
      { locale: 'es', preheader: 'x', intro: ['Resumen.'], unsubscribeUrl: url },
      siteUrl,
    );
    expect(text).toBe(
      [
        'Resumen.',
        '',
        'Un saludo,',
        'El equipo de Codeqlick',
        '',
        `¿No quieres recibir estos correos? Darse de baja: ${url}`,
      ].join('\n'),
    );
    expect(html).toContain(
      `¿No quieres recibir estos correos? <a href="${url}" target="_blank" style="color:#D9177E;text-decoration:underline;">Darse de baja</a>`,
    );

    const english = renderEmail(
      {
        locale: 'en',
        preheader: 'x',
        intro: ['Summary.'],
        unsubscribeUrl: 'https://x.test/u?a=1&b=2',
      },
      siteUrl,
    );
    expect(english.text).toContain(
      "Don't want these emails? Unsubscribe: https://x.test/u?a=1&b=2",
    );
    expect(english.html).toContain('href="https://x.test/u?a=1&amp;b=2"');
    expect(english.html).toContain('>Unsubscribe</a>');
  });

  it('has no unsubscribe link in transactional emails', () => {
    const { text, html } = renderEmail(
      { locale: 'en', preheader: 'x', intro: ['Reset.'] },
      siteUrl,
    );
    expect(text).not.toContain('Unsubscribe');
    expect(html).not.toContain('Unsubscribe');
    expect(html).not.toContain('email/unsubscribe');
  });

  it('can end without a signature', () => {
    const { text } = renderEmail(
      { locale: 'en', preheader: 'x', intro: ['Only this.'], signoff: [] },
      siteUrl,
    );
    expect(text).toBe('Only this.');
  });

  describe("Neoqlick's emails (architecture 4.18)", () => {
    const neo = 'https://neoqlick.com';
    const content = {
      brand: 'neoqlick' as const,
      locale: 'es' as const,
      preheader: 'Abre el enlace en tu cuenta de Codeqlick.',
      title: 'Confirma tu email — Codeqlick',
      greeting: 'Hola Ada:',
      intro: ['Para crear tu cuenta de Codeqlick, confirma que este correo es tuyo:'],
      quote: { title: 'Alertas de seguridad de Codeqlick', body: 'El equipo de Codeqlick' },
      details: [['Codeqlick', 'Ada']] as Array<[string, string]>,
      button: { label: 'Abrir Codeqlick', url: 'https://neoqlick.com/es/confirm' },
      outro: ['Gracias por usar Codeqlick.'],
      note: 'Si no has sido tú, ignora este correo de Codeqlick.',
      unsubscribeUrl: 'https://neoqlick.com/es/email/unsubscribe?token=abc',
    };

    it('never says Codeqlick, in the text or the HTML', () => {
      for (const locale of ['en', 'es', 'fr', 'de', 'it', 'pt'] as const) {
        const rendered = renderEmail({ ...content, locale }, neo);
        expect(rendered.text.toLowerCase()).not.toContain('codeqlick');
        expect(rendered.html.toLowerCase()).not.toContain('codeqlick');
        expect(rendered.text).toContain('Neoqlick');
        expect(rendered.text).toContain('hello@neoqlick.com');
      }
    });

    it('has its own header, colours and footer', () => {
      const { html } = renderEmail(content, neo);
      expect(html).toContain('https://neoqlick.com/email/neoqlick-logo.png');
      expect(html).toContain('#7C3AED');
      expect(html).toContain('Montserrat');
      expect(html).toContain('mailto:hello@neoqlick.com');
      expect(html).not.toContain('#D9177E');
      expect(html).not.toContain('Space Grotesk');
      expect(html).not.toContain('Redefining information technology in society');
    });

    it('marks the message so MailService sends it from Neoqlick', () => {
      expect(renderEmail(content, neo).brand).toBe('neoqlick');
      expect(renderEmail({ ...content, brand: undefined }, siteUrl)).not.toHaveProperty('brand');
    });

    it("leaves a link's address as it was given", () => {
      const { text } = renderEmail(content, neo);
      expect(text).toContain('https://neoqlick.com/es/confirm');
    });

    it("keeps Codeqlick's emails as they were", () => {
      const { html, text } = renderEmail({ locale: 'en', preheader: 'x', intro: ['Hi'] }, siteUrl);
      expect(html).toContain('https://codeqlick.com/email/logo.png');
      expect(html).toContain('#D9177E');
      expect(html).toContain('hello@codeqlick.com');
      expect(text).toContain('The Codeqlick team');
    });
  });
});
