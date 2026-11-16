import { describe, expect, it } from 'vitest';
import {
  cspHeaders,
  makeNonce,
  permissionsPolicy,
  previousCsp,
  securityHeaders,
  strictCsp,
  type CspContext,
} from './security-headers';
import { EXOCLICK_HOSTS } from './videochat-ads';
import { WEBAPPS } from './webapps';

const SITE = ['https://codeqlick.com', ...WEBAPPS.map((app) => `https://${app}.codeqlick.com`)];

function context(app: string | null, extra: Partial<CspContext> = {}): CspContext {
  return {
    app,
    origin: app ? `https://${app}.codeqlick.com` : 'https://codeqlick.com',
    siteOrigins: SITE,
    ...extra,
  };
}

/** `{ 'script-src': ['self', …] }` from a policy. */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split('; ').map((directive) => {
      const [name, ...values] = directive.split(' ');
      return [name!, values];
    }),
  );
}

describe('strictCsp', () => {
  const NONCE = 'bm9uY2Vub25jZW5vbmNlMQ==';

  it('allows scripts only with the nonce and what they load, on every host', () => {
    for (const app of [null, ...WEBAPPS, 'account']) {
      const policy = parse(strictCsp(context(app), NONCE));
      expect(policy['script-src']).toContain(`'nonce-${NONCE}'`);
      expect(policy['script-src']).toContain("'strict-dynamic'");
      expect(policy['script-src']).not.toContain("'unsafe-inline'");
      expect(policy['script-src']).not.toContain("'unsafe-eval'");
      expect(policy['object-src']).toEqual(["'none'"]);
      expect(policy['base-uri']).toEqual(["'self'"]);
      expect(policy['frame-ancestors']).toEqual(["'none'"]);
      expect(policy['worker-src']).toEqual(["'self'"]);
      expect(policy['upgrade-insecure-requests']).toEqual([]);
      expect(policy['report-uri']).toEqual(['/api/csp-report']);
      expect(policy['report-to']).toEqual(['csp']);
      expect(policy['form-action']).toEqual([
        "'self'",
        ...SITE,
        'https://checkout.stripe.com',
        'https://billing.stripe.com',
        'https://github.com',
      ]);
      expect(policy['connect-src']).toEqual(
        expect.arrayContaining(["'self'", 'https://challenges.cloudflare.com']),
      );
      expect(policy['frame-src']).toEqual(
        expect.arrayContaining(["'self'", 'https://challenges.cloudflare.com']),
      );
    }
  });

  it('adds ExoClick only on the hosts with ads', () => {
    for (const app of ['videochat', 'swipe']) {
      const policy = parse(strictCsp(context(app), NONCE));
      for (const directive of ['script-src', 'connect-src', 'frame-src']) {
        expect(policy[directive]).toEqual(expect.arrayContaining(EXOCLICK_HOSTS));
      }
      expect(policy['img-src']).toContain('https:');
      // Its click handlers are attributes; script elements still need the nonce.
      expect(policy['script-src-attr']).toEqual(["'unsafe-inline'"]);
    }
    for (const app of [null, 'meetings', 'citas', 'cruising', 'cloud', 'account']) {
      expect(strictCsp(context(app), NONCE)).not.toContain('exoclick');
      expect(parse(strictCsp(context(app), NONCE))['script-src-attr']).toBeUndefined();
    }
  });

  it('keeps images minimal: remote ones on the main host, the map tiles on Cruising', () => {
    expect(parse(strictCsp(context(null), NONCE))['img-src']).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https:',
    ]);
    expect(parse(strictCsp(context('cruising'), NONCE))['img-src']).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://tile.openstreetmap.org',
    ]);
    for (const app of ['meetings', 'citas', 'cloud', 'account']) {
      expect(parse(strictCsp(context(app), NONCE))['img-src']).toEqual([
        "'self'",
        'data:',
        'blob:',
      ]);
    }
  });

  it('adds sockets on another origin, and upgrades requests only over HTTPS', () => {
    const local = context('videochat', {
      origin: 'http://videochat.localhost:3000',
      sockets: ['ws://localhost:4000'],
    });
    const policy = parse(strictCsp(local, NONCE));
    expect(policy['connect-src']).toContain('ws://localhost:4000');
    expect(policy['upgrade-insecure-requests']).toBeUndefined();
  });
});

describe('previousCsp', () => {
  it('keeps inline scripts but everything else of the strict policy', () => {
    const policy = parse(previousCsp(context('cruising')));
    expect(policy['script-src']).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://challenges.cloudflare.com',
    ]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['report-uri']).toBeUndefined();
  });
});

describe('cspHeaders', () => {
  it('reports the strict policy while the previous one is enforced', () => {
    const headers = cspHeaders(context(null), 'abc', false);
    expect(headers['Content-Security-Policy']).toContain("'unsafe-inline'");
    expect(headers['Content-Security-Policy-Report-Only']).toContain("'nonce-abc'");
    expect(headers['Reporting-Endpoints']).toBe('csp="https://codeqlick.com/api/csp-report"');
  });

  it('enforces the strict policy alone when switched on', () => {
    const headers = cspHeaders(context('meetings'), 'abc', true);
    expect(headers['Content-Security-Policy']).toContain("'nonce-abc'");
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-inline' https://challenges");
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined();
    expect(headers['Reporting-Endpoints']).toBe(
      'csp="https://meetings.codeqlick.com/api/csp-report"',
    );
  });
});

describe('makeNonce', () => {
  it('is 16 random bytes in base64, new every time', () => {
    const a = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(makeNonce()).not.toBe(a);
  });
});

describe('permissionsPolicy', () => {
  const policy = (app: string | null) =>
    Object.fromEntries(
      permissionsPolicy(app)
        .split(', ')
        .map((entry) => entry.split('=')),
    );

  it('lets only the calling apps use the camera, the microphone and screen sharing', () => {
    for (const app of ['videochat', 'meetings']) {
      expect(policy(app)).toMatchObject({
        camera: '(self)',
        microphone: '(self)',
        'display-capture': '(self)',
        geolocation: '()',
      });
    }
  });

  it('lets only Cruising locate the device', () => {
    expect(policy('cruising')).toMatchObject({ geolocation: '(self)', camera: '()' });
  });

  it('turns everything off elsewhere but passkeys', () => {
    for (const app of [null, 'citas', 'swipe', 'cloud', 'account']) {
      const entries = policy(app);
      expect(entries['publickey-credentials-get']).toBe('(self)');
      expect(entries['publickey-credentials-create']).toBe('(self)');
      const others = Object.entries(entries).filter(([name]) => !name.startsWith('publickey'));
      expect(others.every(([, value]) => value === '()')).toBe(true);
    }
  });
});

describe('securityHeaders', () => {
  it('sends HSTS with subdomains (no preload) in production only', () => {
    const production = Object.fromEntries(
      securityHeaders(null, true).map(({ key, value }) => [key, value]),
    );
    expect(production).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    });
    expect(production['Strict-Transport-Security']).not.toContain('preload');
    expect(securityHeaders(null, false).map(({ key }) => key)).not.toContain(
      'Strict-Transport-Security',
    );
  });
});
