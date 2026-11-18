import type { IncomingHttpHeaders } from 'node:http';
import type { RetireRepository } from './retire.js';

/** What the TLS handshakes found (architecture 4.19); null fields: not known. */
export interface TlsInputs {
  /** The default handshake: `TLSv1.3`, `TLSv1.2`, … */
  version: string | null;
  cipher: string | null;
  /** Chain trusted, name matching, not expired. */
  authorized: boolean;
  /** Node's reason when not (`CERT_HAS_EXPIRED`, `ERR_TLS_CERT_ALTNAME_INVALID`, …). */
  authError: string | null;
  validTo: Date | null;
  /** The server accepted a TLS 1.0 / 1.1 handshake (null: the probe couldn't try). */
  tls10: boolean | null;
  tls11: boolean | null;
}

/** An answer to a page request. */
export interface PageInput {
  /** The URL that answered, after redirects. */
  url: string;
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface WebInputs {
  /** The homepage over HTTPS (the certificate may be wrong); null: no website answered. */
  page: PageInput | null;
  /** The certificate failed and the page was read anyway. */
  certificateFailed: boolean;
  /** `http://<domain>/` followed to its end; null: nothing answered on http. */
  http: { finalUrl: string; firstRedirect: string | null; status: number } | null;
  /** The default handshake worked or not at all (null: nothing answered on 443). */
  tls: TlsInputs | null;
  /** The body of `/.well-known/security.txt` when it is there. */
  securityTxt: string | null;
}

export interface DnsInputs {
  /** null: the lookup failed (not "no records"). */
  mx: Array<{ exchange: string; priority: number }> | null;
  txt: string[] | null;
  spf: {
    /** The SPF records found (more than one is an error). */
    records: string[];
    lookups: number;
    /** The record a `redirect=` points to, when followed. */
    redirectRecord: string | null;
  };
  dmarc: string[] | null;
  /** Common selectors with a record. */
  dkim: string[];
  caa: string[] | null;
  mtaSts: { txt: string[]; policy: string | null };
  tlsRpt: string[] | null;
  /** `ad`: the validating resolver set the AD flag; null fields: the resolver didn't answer. */
  dnssec: { ad: boolean | null; hasDs: boolean | null };
}

export interface SecurityInputs {
  domain: string;
  now: Date;
  web: WebInputs;
  dns: DnsInputs;
  /** null: the Retire.js data isn't available. */
  retire: RetireRepository | null;
}
