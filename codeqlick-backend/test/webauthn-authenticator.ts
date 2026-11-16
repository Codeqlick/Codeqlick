import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/**
 * A software passkey for the e2e tests: an ES256 key and just enough CBOR to build what a browser
 * returns from `navigator.credentials.create()` (attestation "none") and `.get()`, so the API's
 * real verification runs end to end.
 */

type Cbor = number | string | Uint8Array | Cbor[] | Map<number | string, Cbor>;

function header(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  if (length < 0x10000) {
    const out = Buffer.alloc(3);
    out[0] = (major << 5) | 25;
    out.writeUInt16BE(length, 1);
    return out;
  }
  const out = Buffer.alloc(5);
  out[0] = (major << 5) | 26;
  out.writeUInt32BE(length, 1);
  return out;
}

export function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') {
    return value >= 0 ? header(0, value) : header(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([header(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return Buffer.concat([header(2, value.length), value]);
  if (Array.isArray(value)) return Buffer.concat([header(4, value.length), ...value.map(cbor)]);
  const parts = [header(5, value.size)];
  for (const [key, item] of value) parts.push(cbor(key), cbor(item));
  return Buffer.concat(parts);
}

const b64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();

function uint32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value, 0);
  return out;
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private counter = 0;
  /** The account's handle, as the API gave it when the passkey was created. */
  private userHandle = '';

  constructor(
    private readonly rpId = 'localhost',
    private readonly origin = 'http://localhost:3000',
    /** Synced passkeys never count (always 0); security keys do. */
    private readonly counts = true,
  ) {
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  private coseKey(): Buffer {
    const jwk = this.publicKey.export({ format: 'jwk' });
    return cbor(
      new Map<number, Cbor>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    );
  }

  private clientData(type: string, challenge: string, origin = this.origin): string {
    return b64url(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  /** What `navigator.credentials.create()` answers for the API's creation options. */
  register(options: { challenge: string; user: { id: string } }, origin = this.origin) {
    this.userHandle = options.user.id;
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length, 0);
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([FLAG_UP | FLAG_UV | FLAG_AT]),
      uint32(this.counter),
      Buffer.alloc(16), // AAGUID
      idLength,
      this.credentialId,
      this.coseKey(),
    ]);
    const attestationObject = cbor(
      new Map<string, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: this.clientData('webauthn.create', options.challenge, origin),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
      authenticatorAttachment: 'platform' as const,
      clientExtensionResults: {},
    };
  }

  /** What `navigator.credentials.get()` answers for the API's request options. */
  authenticate(options: { challenge: string }, overrides: { counter?: number } = {}) {
    if (this.counts) this.counter += 1;
    const counter = overrides.counter ?? this.counter;
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([FLAG_UP | FLAG_UV]),
      uint32(counter),
    ]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(Buffer.from(clientDataJSON, 'base64url'))]),
      this.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON,
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: this.userHandle,
      },
      authenticatorAttachment: 'platform' as const,
      clientExtensionResults: {},
    };
  }
}
