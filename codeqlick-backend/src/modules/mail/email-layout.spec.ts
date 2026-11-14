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
});
