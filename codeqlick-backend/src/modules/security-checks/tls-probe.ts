import { connect, type TLSSocket } from 'node:tls';
import { resolvePublicAddress } from '../../common/safe-fetch.js';
import { HANDSHAKE_FAILED, type TlsInputs } from './security-check-inputs.js';

const HANDSHAKE_TIMEOUT_MS = 8_000;

interface Handshake {
  protocol: string | null;
  cipher: string | null;
  authorized: boolean;
  authError: string | null;
  validTo: Date | null;
  issuer: string | null;
}

/** One normal client handshake with `domain` on port 443 at the (public) address given. */
function handshake(
  address: string,
  domain: string,
  options: { minVersion?: 'TLSv1' | 'TLSv1.1'; maxVersion?: 'TLSv1' | 'TLSv1.1' },
  signal?: AbortSignal,
): Promise<Handshake> {
  return new Promise((resolve, reject) => {
    const legacy = options.maxVersion !== undefined;
    function finish(error: Error | null, value?: Handshake): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      if (error) reject(error);
      else resolve(value!);
    }
    const onAbort = () => finish(Object.assign(new Error('Aborted'), { code: 'ABORT_ERR' }));
    const timer = setTimeout(
      () => finish(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })),
      HANDSHAKE_TIMEOUT_MS,
    );
    const socket: TLSSocket = connect({
      host: address,
      port: 443,
      servername: domain,
      // Certificates are inspected, not enforced: the handshake itself is what is looked at.
      rejectUnauthorized: false,
      // A legacy client hello: the lowest security level lets OpenSSL send TLS 1.0 / 1.1 at all.
      ...(legacy ? { ...options, ciphers: 'ALL:@SECLEVEL=0' } : {}),
    });
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      const validTo = certificate?.valid_to ? new Date(certificate.valid_to) : null;
      const rawIssuer: unknown = certificate?.issuer?.O;
      const issuer = Array.isArray(rawIssuer) ? rawIssuer[0] : rawIssuer;
      finish(null, {
        issuer: typeof issuer === 'string' && issuer.trim() !== '' ? issuer.trim() : null,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name ?? null,
        authorized: socket.authorized,
        authError: socket.authorizationError ? String(socket.authorizationError) : null,
        validTo: validTo && !Number.isNaN(validTo.getTime()) ? validTo : null,
      });
    });
    socket.once('error', (error) => finish(error));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The client itself can't speak the protocol: no verdict about the server. */
function locallyImpossible(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ERR_SSL_NO_PROTOCOLS_AVAILABLE' || code === 'ERR_TLS_INVALID_PROTOCOL_VERSION';
}

/** Did the server complete a handshake limited to one legacy version? null: couldn't try. */
async function acceptsLegacy(
  address: string,
  domain: string,
  version: 'TLSv1' | 'TLSv1.1',
  signal?: AbortSignal,
) {
  try {
    await handshake(address, domain, { minVersion: version, maxVersion: version }, signal);
    return true;
  } catch (error) {
    return locallyImpossible(error) ? null : false;
  }
}

/**
 * Three normal TLS handshakes with the domain (architecture 4.19): the default one (negotiated
 * version, cipher and certificate) and one each pinned to TLS 1.0 and 1.1. The address is checked
 * like the website check's requests. null: nothing answered on port 443.
 */
export async function probeTls(
  domain: string,
  resolve: (host: string) => Promise<string> = resolvePublicAddress,
  signal?: AbortSignal,
): Promise<TlsInputs | null> {
  let address: string;
  try {
    address = await resolve(domain);
  } catch {
    return null;
  }
  const [main, tls10, tls11] = await Promise.all([
    handshake(address, domain, {}, signal).catch(() => null),
    acceptsLegacy(address, domain, 'TLSv1', signal),
    acceptsLegacy(address, domain, 'TLSv1.1', signal),
  ]);
  if (!main && !tls10 && !tls11) return null;
  return {
    version: main?.protocol ?? null,
    cipher: main?.cipher ?? null,
    authorized: main?.authorized ?? false,
    authError: main?.authError ?? (main ? null : HANDSHAKE_FAILED),
    validTo: main?.validTo ?? null,
    issuer: main?.issuer ?? null,
    tls10,
    tls11,
  };
}
