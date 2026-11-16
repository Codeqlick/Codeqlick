import { createHash } from 'node:crypto';
import type { CspReportInput } from './errors.schemas.js';

/** One violation as it is grouped and kept (architecture 4.11): no IP, no query strings. */
export interface CspViolation {
  /** SHA-256 of the directive and what was blocked. */
  fingerprint: string;
  /** `script-src-elem blocked https://example.com`. */
  message: string;
  /** The page's path, without its query. */
  path: string | null;
  /** The sample: source file and position, the first characters of the script, disposition. */
  sample: string;
  userAgent: string | null;
}

/** Schemes of browser extensions: their reports say nothing about our pages. */
const EXTENSION = /^(chrome|moz|safari|safari-web|ms-browser)-extension:/i;
/** Keywords a browser puts instead of a URL. */
const KEYWORD = /^(inline|eval|wasm-eval|data|blob|self|trusted-types-[a-z-]+)$/i;

/** What was blocked, safe to keep and to group by: the origin of a URL, or the keyword. */
export function blockedSource(blocked: string | undefined): string | null {
  const value = (blocked ?? '').trim();
  if (!value) return 'inline';
  if (KEYWORD.test(value)) return value.toLowerCase();
  if (/^(data|blob|filesystem|about|mediastream):/i.test(value)) {
    return value.slice(0, value.indexOf(':')).toLowerCase();
  }
  try {
    const url = new URL(value);
    if (url.origin === 'null') return url.protocol.replace(/:$/, '');
    return url.origin;
  } catch {
    return null;
  }
}

/** A document's path without its query or fragment; null when it isn't a URL. */
function pathOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname.slice(0, 500);
  } catch {
    return null;
  }
}

/** A script's URL without its query: origin and path. */
function fileOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin === 'null' ? parsed.protocol : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

interface RawViolation {
  documentUrl?: string;
  directive?: string;
  blocked?: string;
  sourceFile?: string;
  line?: number;
  column?: number;
  sample?: string;
  disposition?: string;
  userAgent?: string;
}

function raw(input: CspReportInput, userAgent: string | undefined): RawViolation[] {
  if (!Array.isArray(input)) {
    const report = input['csp-report'];
    return [
      {
        documentUrl: report['document-uri'],
        directive: report['effective-directive'] ?? report['violated-directive'],
        blocked: report['blocked-uri'],
        sourceFile: report['source-file'],
        line: report['line-number'],
        column: report['column-number'],
        sample: report['script-sample'],
        disposition: report.disposition,
        userAgent,
      },
    ];
  }
  return input.flatMap((item) =>
    item.type === 'csp-violation' && item.body
      ? [
          {
            documentUrl: item.body.documentURL,
            directive: item.body.effectiveDirective,
            blocked: item.body.blockedURL,
            sourceFile: item.body.sourceFile,
            line: item.body.lineNumber,
            column: item.body.columnNumber,
            sample: item.body.sample,
            disposition: item.body.disposition,
            userAgent: item.user_agent ?? userAgent,
          },
        ]
      : [],
  );
}

/**
 * The violations of a report worth keeping, ready to group: extensions' and malformed ones are
 * dropped, URLs are cut to their origin (what was blocked) or path (the page).
 */
export function cspViolations(input: CspReportInput, userAgent?: string): CspViolation[] {
  return raw(input, userAgent).flatMap((violation) => {
    // `violated-directive` may carry the whole directive ("script-src 'self' …"): its name only.
    const directive = violation.directive?.trim().split(/\s+/)[0]?.toLowerCase();
    if (!directive || !/^[a-z-]{3,40}$/.test(directive)) return [];
    if (EXTENSION.test(violation.blocked ?? '') || EXTENSION.test(violation.sourceFile ?? '')) {
      return [];
    }
    const blocked = blockedSource(violation.blocked);
    if (!blocked) return [];
    const file = fileOf(violation.sourceFile);
    const position = file
      ? `${file}${violation.line ? `:${violation.line}${violation.column ? `:${violation.column}` : ''}` : ''}`
      : null;
    const sample = [
      `disposition: ${violation.disposition === 'enforce' ? 'enforce' : 'report'}`,
      position ? `source: ${position}` : null,
      violation.sample ? `sample: ${violation.sample.slice(0, 40)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return [
      {
        fingerprint: createHash('sha256').update(`CSP\n${directive}\n${blocked}`).digest('hex'),
        message: `${directive} blocked ${blocked}`.slice(0, 1000),
        path: pathOf(violation.documentUrl),
        sample,
        userAgent: violation.userAgent?.slice(0, 300) ?? null,
      },
    ];
  });
}
