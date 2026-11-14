import { describe, expect, it } from 'vitest';
import {
  PROTECTION_PAGE_HEADERS,
  escapeHtml,
  renderProtectionPage,
} from './cloud-protection-page.js';

describe('the password page', () => {
  it('escapes the project name and next', () => {
    const html = renderProtectionPage({
      locale: 'en',
      projectName: '<script>alert("x")</script> & \'co\'',
      next: '/a?b="><img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;co&#39;');
    expect(html).toContain('name="next" value="/a?b=&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
  });

  it('answers in English or Spanish', () => {
    const en = renderProtectionPage({ locale: 'en', projectName: 'Docs', next: '/' });
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('This site asks for a password');
    expect(en).toContain('>Continue<');
    const es = renderProtectionPage({ locale: 'es', projectName: 'Docs', next: '/' });
    expect(es).toContain('<html lang="es">');
    expect(es).toContain('Este sitio pide una contraseña');
    expect(es).toContain('>Continuar<');
  });

  it('shows the error it is given', () => {
    const page = (error: 'wrong' | 'expired' | 'wait', locale: 'en' | 'es' = 'en') =>
      renderProtectionPage({ locale, projectName: null, next: '/', error });
    expect(page('wrong')).toContain('Wrong password');
    expect(page('expired')).toContain('This link has expired');
    expect(page('wait')).toContain('Wait a minute');
    expect(page('wrong', 'es')).toContain('Contraseña incorrecta');
    expect(renderProtectionPage({ locale: 'en', projectName: null, next: '/' })).not.toContain(
      'role="alert"',
    );
  });

  it('is self-contained: the inline logo and no external resources', () => {
    const html = renderProtectionPage({ locale: 'en', projectName: 'Docs', next: '/' });
    expect(html).toContain('<circle cx="28" cy="28" r="18"');
    expect(html).toContain('M36 36 L60 45 L49 48 L46 59 Z');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('action="/__codeqlick/password"');
    expect(html).not.toMatch(/\b(?:src|href)=/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script');
  });

  it('is sent with a strict policy and never cached or indexed', () => {
    expect(PROTECTION_PAGE_HEADERS['Content-Security-Policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(PROTECTION_PAGE_HEADERS['X-Robots-Tag']).toBe('noindex');
    expect(PROTECTION_PAGE_HEADERS['Cache-Control']).toBe('no-store');
  });

  it('escapes the five special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
