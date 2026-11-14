import { z } from 'zod';
import { CLOUD_PLANS } from './cloud-plans.js';

/**
 * `codeqlick.json` (architecture 4.13 "Redirects, rewrites and headers", decision 52): the
 * schema and limits, the patterns, and the pure evaluation of a request against a deployment's
 * rules. No I/O: the files are asked for through a callback.
 */

/** The path no file can match: the answer when nothing serves a request (Nginx falls back). */
export const NONE_PATH = '/.cq-none';
/** The empty marker the API writes in a deployment's folder when it has rules. */
export const RULES_MARKER = '.cq-rules';

export type RedirectStatus = 301 | 302 | 307 | 308;
const STATUS_MESSAGE = 'must be 301, 302, 307 or 308';

/** The parsed rules, without the CLI's link keys (`team`, `project`, `dir`) and `$schema`. */
export interface CloudConfig {
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  redirects?: Array<{ source: string; destination: string; status?: RedirectStatus }>;
  rewrites?: Array<{ source: string; destination: string }>;
  headers?: Array<{ source: string; headers: Record<string, string> }>;
}

export interface ConfigError {
  path: string;
  message: string;
}

export interface ConfigLimits {
  /** Redirects plus rewrites. */
  rules: number;
  headerRules: number;
  bytes: number;
}

export interface RulesSummary {
  redirects: number;
  rewrites: number;
  headers: number;
  cleanUrls: boolean;
  trailingSlash: boolean | null;
}

export const MAX_ERRORS = 20;
const MAX_PARAMS = 5;
const SOURCE_MAX = 500;
const DESTINATION_MAX = 2000;
const HEADERS_PER_RULE = 20;
const HEADER_VALUE_MAX = 2048;
const HEADER_VALUES_MAX = 16 * 1024;

export function limitsFor(plan: 'FREE' | 'PRO'): ConfigLimits {
  const limits = CLOUD_PLANS[plan];
  return {
    rules: limits.configRules,
    headerRules: limits.configHeaderRules,
    bytes: limits.configBytes,
  };
}

/** The hard maximums (the biggest plan's): what the published JSON Schema carries. */
const HARD = limitsFor('PRO');

// ── Headers ───────────────────────────────────────────────────────────────────────────────────

/** The only headers a rule may add: Nginx adds headers it knows by name (decision 52). */
export const ALLOWED_HEADERS = [
  'Content-Security-Policy',
  'Content-Security-Policy-Report-Only',
  'Cache-Control',
  'Permissions-Policy',
  'X-Frame-Options',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Embedder-Policy',
  'Cross-Origin-Resource-Policy',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers',
  'Link',
  'X-Robots-Tag',
  'Content-Language',
] as const;

const ALLOWED = new Map<string, string>(ALLOWED_HEADERS.map((name) => [name.toLowerCase(), name]));
/** Set by Cloud itself; a deployment can't weaken them. */
const CLOUD_OWN = new Set([
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
]);
/** Would break the response or identify the site. */
const BREAKING = new Set([
  'set-cookie',
  'content-type',
  'content-length',
  'content-encoding',
  'location',
  'host',
]);

/** The allowed spelling of a header name, or null when it is not allowed. */
export function allowedHeader(name: string): string | null {
  return ALLOWED.get(name.toLowerCase()) ?? null;
}

function headerNameProblem(name: string): string | null {
  const lower = name.toLowerCase();
  if (ALLOWED.has(lower)) return null;
  if (CLOUD_OWN.has(lower)) {
    return "not an allowed header: Codeqlick Cloud sets it and a deployment can't change it";
  }
  if (BREAKING.has(lower)) {
    return 'not an allowed header: it would break the response or identify the site';
  }
  return `not an allowed header; allowed: ${ALLOWED_HEADERS.join(', ')}`;
}

function hasControl(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// ── Patterns ──────────────────────────────────────────────────────────────────────────────────

export interface Segment {
  kind: 'literal' | 'param' | 'rest';
  value: string;
}

export interface Pattern {
  segments: Segment[];
  params: string[];
}

export class PatternError extends Error {}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOKEN = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Compiles a source: `/`-separated segments; `:name` is one segment, `:name*` and `*` (`:splat`)
 * the rest of the path. Throws PatternError with the reason.
 */
export function compilePattern(source: string): Pattern {
  if (!source.startsWith('/')) throw new PatternError('must start with /');
  if (hasControl(source) || source.includes('\\')) {
    throw new PatternError('must not contain control characters or backslashes');
  }
  if (
    source === '/__codeqlick' ||
    source.startsWith('/__codeqlick/') ||
    source.startsWith('/__cq_')
  ) {
    throw new PatternError("paths starting with /__codeqlick/ or /__cq_ are Codeqlick Cloud's own");
  }
  const parts = source.slice(1).split('/');
  const segments: Segment[] = [];
  const params: string[] = [];
  parts.forEach((part, index) => {
    const last = index === parts.length - 1;
    if (part === '') {
      if (!last) throw new PatternError('has an empty segment');
      segments.push({ kind: 'literal', value: '' });
      return;
    }
    let segment: Segment;
    if (part === '*') {
      segment = { kind: 'rest', value: 'splat' };
    } else if (part.startsWith(':')) {
      const rest = part.endsWith('*');
      const name = rest ? part.slice(1, -1) : part.slice(1);
      if (!NAME.test(name)) throw new PatternError(`has a bad parameter name: ${part}`);
      segment = { kind: rest ? 'rest' : 'param', value: name };
    } else if (part.includes('*')) {
      throw new PatternError('a * must be a whole segment (* or :name*)');
    } else {
      segment = { kind: 'literal', value: part };
    }
    if (segment.kind === 'rest' && !last) {
      throw new PatternError('a wildcard must be the last segment');
    }
    if (segment.kind !== 'literal') {
      if (params.includes(segment.value)) {
        throw new PatternError(`repeats the parameter :${segment.value}`);
      }
      params.push(segment.value);
    }
    segments.push(segment);
  });
  if (params.length > MAX_PARAMS) throw new PatternError(`has more than ${MAX_PARAMS} parameters`);
  return { segments, params };
}

/** The parameters of a decoded path, or null when the pattern doesn't match it. */
export function matchPattern(pattern: Pattern, path: string): Map<string, string> | null {
  const parts = path.slice(1).split('/');
  const found = new Map<string, string>();
  for (let index = 0; index < pattern.segments.length; index += 1) {
    const segment = pattern.segments[index]!;
    if (segment.kind === 'rest') {
      found.set(segment.value, parts.slice(index).join('/'));
      return found;
    }
    const part = parts[index];
    if (part === undefined) return null;
    if (segment.kind === 'literal') {
      if (part !== segment.value) return null;
    } else {
      if (part === '') return null;
      found.set(segment.value, part);
    }
  }
  return parts.length === pattern.segments.length ? found : null;
}

type Token = { text: string } | { param: string };

/** A destination cut into literal text and `:name` parameters. */
function tokenize(destination: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of destination.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) tokens.push({ text: destination.slice(last, start) });
    tokens.push({ param: match[1]! });
    last = start + match[0].length;
  }
  if (last < destination.length) tokens.push({ text: destination.slice(last) });
  return tokens;
}

function unknownParams(tokens: Token[], pattern: Pattern): string | null {
  for (const token of tokens) {
    if ('param' in token && !pattern.params.includes(token.param)) {
      const defined = pattern.params.length
        ? `the source defines ${pattern.params.map((name) => `:${name}`).join(', ')}`
        : 'the source defines none';
      return `uses :${token.param}, but ${defined}`;
    }
  }
  return null;
}

const ABSOLUTE = /^https?:\/\//i;

function redirectDestinationProblem(destination: string, pattern: Pattern): string | null {
  if (hasControl(destination) || destination.includes('\\')) {
    return 'must not contain control characters or backslashes';
  }
  if (ABSOLUTE.test(destination)) {
    const origin = /^https?:\/\/[^/?#]*/i.exec(destination)![0];
    if (origin.includes('@')) return 'must not carry credentials';
    if (tokenize(origin).some((token) => 'param' in token)) {
      return "a parameter can't be in the host";
    }
    try {
      const url = new URL(destination);
      if (!url.hostname) return 'is not a valid URL';
      if (url.username || url.password) return 'must not carry credentials';
    } catch {
      return 'is not a valid URL';
    }
    return unknownParams(tokenize(destination.slice(origin.length)), pattern);
  }
  if (destination.startsWith('//')) return 'a path starts with a single /';
  if (!destination.startsWith('/')) {
    return 'must be a path starting with / or an absolute https:// or http:// URL';
  }
  return unknownParams(tokenize(destination), pattern);
}

function rewriteDestinationProblem(destination: string, pattern: Pattern): string | null {
  if (!destination.startsWith('/') || destination.startsWith('//')) {
    return 'must be a path inside the deployment starting with a single / (Cloud never proxies another address)';
  }
  if (hasControl(destination) || destination.includes('\\')) {
    return 'must not contain control characters or backslashes';
  }
  if (destination.includes('?') || destination.includes('#')) {
    return 'must have no query or fragment';
  }
  for (const part of destination.split('/')) {
    if (part === '.' || part === '..') return 'must not contain . or .. segments';
    if (part.startsWith('.cq-')) return 'paths starting with .cq- are reserved for Codeqlick Cloud';
  }
  return unknownParams(tokenize(destination), pattern);
}

// ── Parsing and validation ────────────────────────────────────────────────────────────────────

const text = (max: number) =>
  z.string().min(1, 'must not be empty').max(max, `at most ${max} characters`);

const statusSchema = z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)], {
  error: STATUS_MESSAGE,
});

/** The structure of `codeqlick.json`; unknown keys are refused. Patterns and headers: `semantic`. */
const configSchema = z.strictObject({
  $schema: z.string().optional().describe('The JSON Schema of this file.'),
  team: z.string().optional().describe("The CLI's link: the team's address."),
  project: z.string().optional().describe("The CLI's link: the project's address."),
  dir: z.string().optional().describe("The CLI's link: the folder to deploy."),
  cleanUrls: z
    .boolean()
    .optional()
    .describe('true (default): /about serves about.html. false: only exact files and folders.'),
  trailingSlash: z
    .boolean()
    .optional()
    .describe(
      'true: /about redirects to /about/. false: /about/ redirects to /about. Unset: both answer.',
    ),
  redirects: z
    .array(
      z.strictObject({
        source: text(SOURCE_MAX).describe('A path: /old/:slug, /docs/* (the rest of the path).'),
        destination: text(DESTINATION_MAX).describe('A path or an https:// URL; may use :slug.'),
        status: statusSchema.optional().describe('301, 302, 307 or 308 (default).'),
      }),
    )
    .max(HARD.rules, `at most ${HARD.rules} rules`)
    .optional()
    .describe('Redirects, in order: the first match wins, before any file is looked at.'),
  rewrites: z
    .array(
      z.strictObject({
        source: text(SOURCE_MAX),
        destination: text(DESTINATION_MAX).describe(
          'A file of the deployment, such as /app/index.html.',
        ),
      }),
    )
    .max(HARD.rules, `at most ${HARD.rules} rules`)
    .optional()
    .describe('Serve another file of the deployment, only when no file matches.'),
  headers: z
    .array(
      z.strictObject({
        source: text(SOURCE_MAX),
        headers: z
          .record(z.string(), z.string())
          .describe(`Header name to value. Allowed: ${ALLOWED_HEADERS.join(', ')}.`),
      }),
    )
    .max(HARD.headerRules, `at most ${HARD.headerRules} rules`)
    .optional()
    .describe('Headers added to the responses of the paths that match; every matching rule adds.'),
});

/** The JSON Schema of the file (made from the same Zod schema), with the hard maximums. */
export function configJsonSchema(): Record<string, unknown> {
  const params = { io: 'input', unrepresentable: 'any' } as unknown as Parameters<
    typeof z.toJSONSchema
  >[1];
  return z.toJSONSchema(configSchema, params) as Record<string, unknown>;
}

const FILE = 'codeqlick.json';

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out || FILE;
}

function structureErrors(issues: z.ZodError['issues']): ConfigError[] {
  const errors: ConfigError[] = [];
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        errors.push({ path: formatPath([...issue.path, key]), message: 'not a known key' });
      }
    } else {
      errors.push({ path: formatPath(issue.path), message: issue.message });
    }
  }
  return errors;
}

function jsonErrorLine(source: string, error: unknown): number | null {
  const message = error instanceof Error ? error.message : '';
  const line = /line (\d+)/.exec(message);
  if (line) return Number(line[1]);
  const position = /position (\d+)/.exec(message);
  if (position) return source.slice(0, Number(position[1])).split('\n').length;
  return null;
}

/** The error of a file over its plan's size (checked before it is read or parsed). */
export function sizeError(bytes: number, limits: ConfigLimits, plan: string): ConfigError {
  const kb = (value: number) => `${Math.round((value / 1024) * 10) / 10} KB`;
  return {
    path: FILE,
    message: `${kb(bytes)}, the ${plan.toLowerCase()} plan allows ${kb(limits.bytes)}`,
  };
}

export type ParseResult =
  { ok: true; config: CloudConfig | null } | { ok: false; errors: ConfigError[] };

/** Everything the structure can't say: patterns, destinations, headers and the plan's limits. */
function semantic(config: CloudConfig, limits: ConfigLimits, plan: string): ConfigError[] {
  const errors: ConfigError[] = [];
  const add = (path: string, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ path, message });
  };
  const planName = plan.toLowerCase();
  const redirects = config.redirects ?? [];
  const rewrites = config.rewrites ?? [];
  const rules = redirects.length + rewrites.length;
  if (rules > limits.rules) {
    add(
      redirects.length > limits.rules ? 'redirects' : 'rewrites',
      `${rules} rules, the ${planName} plan allows ${limits.rules}`,
    );
  }
  if ((config.headers?.length ?? 0) > limits.headerRules) {
    add(
      'headers',
      `${config.headers!.length} rules, the ${planName} plan allows ${limits.headerRules}`,
    );
  }
  if (errors.length > 0) return errors;

  const rule = (
    key: 'redirects' | 'rewrites',
    index: number,
    source: string,
    destination: string,
  ) => {
    let pattern: Pattern;
    try {
      pattern = compilePattern(source);
    } catch (error) {
      add(`${key}[${index}].source`, (error as Error).message);
      return;
    }
    if (source === destination) {
      add(`${key}[${index}].destination`, 'is the same as the source (a certain loop)');
      return;
    }
    const problem =
      key === 'redirects'
        ? redirectDestinationProblem(destination, pattern)
        : rewriteDestinationProblem(destination, pattern);
    if (problem) add(`${key}[${index}].destination`, problem);
  };
  redirects.forEach((item, index) => rule('redirects', index, item.source, item.destination));
  rewrites.forEach((item, index) => rule('rewrites', index, item.source, item.destination));

  (config.headers ?? []).forEach((item, index) => {
    try {
      compilePattern(item.source);
    } catch (error) {
      add(`headers[${index}].source`, (error as Error).message);
    }
    const names = Object.keys(item.headers);
    const where = `headers[${index}].headers`;
    if (names.length > HEADERS_PER_RULE) {
      add(where, `${names.length} headers, at most ${HEADERS_PER_RULE} per rule`);
    }
    const seen = new Set<string>();
    let total = 0;
    for (const name of names) {
      const value = item.headers[name]!;
      const problem = headerNameProblem(name);
      if (problem) {
        add(`${where}.${name}`, problem);
        continue;
      }
      if (seen.has(name.toLowerCase())) {
        add(`${where}.${name}`, 'is repeated (header names are case-insensitive)');
        continue;
      }
      seen.add(name.toLowerCase());
      if (value === '') add(`${where}.${name}`, 'must not be empty');
      else if (!/^[\x20-\x7e]*$/.test(value)) {
        add(`${where}.${name}`, 'must be printable ASCII, on one line');
      } else if (value.length > HEADER_VALUE_MAX) {
        add(`${where}.${name}`, `at most ${HEADER_VALUE_MAX} characters`);
      }
      total += value.length;
    }
    if (total > HEADER_VALUES_MAX) {
      add(where, `${total} characters of values, at most ${HEADER_VALUES_MAX} per rule`);
    }
  });
  return errors;
}

/** The rules as stored: link keys dropped, header names in their allowed spelling, no empty lists. */
function normalise(parsed: z.infer<typeof configSchema>): CloudConfig | null {
  const config: CloudConfig = {};
  if (parsed.cleanUrls !== undefined) config.cleanUrls = parsed.cleanUrls;
  if (parsed.trailingSlash !== undefined) config.trailingSlash = parsed.trailingSlash;
  if (parsed.redirects?.length) {
    config.redirects = parsed.redirects.map((item) => ({
      source: item.source,
      destination: item.destination,
      ...(item.status === undefined ? {} : { status: item.status }),
    }));
  }
  if (parsed.rewrites?.length) {
    config.rewrites = parsed.rewrites.map((item) => ({
      source: item.source,
      destination: item.destination,
    }));
  }
  if (parsed.headers?.length) {
    config.headers = parsed.headers.map((item) => ({
      source: item.source,
      headers: Object.fromEntries(
        Object.entries(item.headers).map(([name, value]) => [allowedHeader(name) ?? name, value]),
      ),
    }));
  }
  return Object.keys(config).length > 0 ? config : null;
}

/**
 * Parses and checks the text of a `codeqlick.json` against a plan's limits. A file with none of
 * the rule keys gives `config: null`. Errors name the exact path of each problem (up to 20).
 */
export function parseConfig(source: string, limits: ConfigLimits, plan: string): ParseResult {
  const bytes = Buffer.byteLength(source);
  if (bytes > limits.bytes) return { ok: false, errors: [sizeError(bytes, limits, plan)] };
  const body = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (error) {
    const line = jsonErrorLine(body, error);
    return {
      ok: false,
      errors: [
        { path: FILE, message: line === null ? 'invalid JSON' : `invalid JSON at line ${line}` },
      ],
    };
  }
  const result = configSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, errors: structureErrors(result.error.issues).slice(0, MAX_ERRORS) };
  }
  // Checked as written (before header names get their allowed spelling), so repeats show.
  const errors = semantic(result.data, limits, plan);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: normalise(result.data) };
}

/** The first problem as the sentence a 400 and a build's log carry. */
export function describeErrors(errors: ConfigError[]): string {
  const first = errors[0];
  if (!first) return 'codeqlick.json is not valid';
  return `${first.path}: ${first.message}`;
}

export function summarize(config: CloudConfig | null): RulesSummary | null {
  if (!config) return null;
  return {
    redirects: config.redirects?.length ?? 0,
    rewrites: config.rewrites?.length ?? 0,
    headers: config.headers?.length ?? 0,
    cleanUrls: config.cleanUrls ?? true,
    trailingSlash: config.trailingSlash ?? null,
  };
}

/** Whether Nginx must ask the API about this deployment (the `.cq-rules` marker, decision 52). */
export function needsMarker(config: CloudConfig | null): boolean {
  if (!config) return false;
  return (
    (config.redirects?.length ?? 0) > 0 ||
    (config.rewrites?.length ?? 0) > 0 ||
    (config.headers?.length ?? 0) > 0 ||
    config.cleanUrls === false ||
    config.trailingSlash !== undefined
  );
}

// ── Evaluation ────────────────────────────────────────────────────────────────────────────────

export type Evaluation =
  | { kind: 'redirect'; status: RedirectStatus; location: string }
  | { kind: 'serve'; path: string; headers: Record<string, string> };

/** Is there a regular file at this path of the deployment (`/about.html`)? */
export type FileCheck = (path: string) => Promise<boolean>;

interface Compiled {
  redirects: Array<{
    pattern: Pattern;
    destination: string;
    tokens: Token[];
    status: RedirectStatus;
  }>;
  rewrites: Array<{ pattern: Pattern; tokens: Token[] }>;
  headers: Array<{ pattern: Pattern; headers: Record<string, string> }>;
}

const compiledCache = new WeakMap<CloudConfig, Compiled>();

function compiled(config: CloudConfig): Compiled {
  let result = compiledCache.get(config);
  if (!result) {
    result = {
      redirects: (config.redirects ?? []).map((item) => ({
        pattern: compilePattern(item.source),
        destination: item.destination,
        tokens: tokenize(item.destination),
        status: item.status ?? 308,
      })),
      rewrites: (config.rewrites ?? []).map((item) => ({
        pattern: compilePattern(item.source),
        tokens: tokenize(item.destination),
      })),
      headers: (config.headers ?? []).map((item) => ({
        pattern: compilePattern(item.source),
        headers: item.headers,
      })),
    };
    compiledCache.set(config, result);
  }
  return result;
}

function safeEncode(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    return encodeURIComponent(value.replace(/[\ud800-\udfff]/g, '�'));
  }
}

/** Percent-encodes what a `Location` can't carry as written, leaving existing `%xx` alone. */
function encodeLiteral(value: string): string {
  return value.replace(/[^\x21-\x7e]|["<>\\^`{|}]/gu, (char) => safeEncode(char));
}

const encodeParam = (value: string) => value.split('/').map(safeEncode).join('/');

function fill(
  tokens: Token[],
  params: Map<string, string>,
  param: (value: string) => string,
  literal: (value: string) => string,
): string {
  return tokens
    .map((token) => ('param' in token ? param(params.get(token.param) ?? '') : literal(token.text)))
    .join('');
}

/** `path` plus the request's query (kept unless `own`), before any `#fragment`. */
function withQuery(location: string, args: string, own: boolean): string {
  if (own || args === '') return location;
  const hash = location.indexOf('#');
  const query = `?${encodeLiteral(args)}`;
  return hash === -1 ? location + query : location.slice(0, hash) + query + location.slice(hash);
}

/** A path on this site as a `Location`: encoded, and never `//host`. */
function localLocation(path: string, args: string): string {
  const encoded = path
    .split('/')
    .map(safeEncode)
    .join('/')
    .replace(/^\/{2,}/, '/');
  return withQuery(encoded, args, false);
}

function reserved(path: string): boolean {
  if (hasControl(path)) return true;
  return path.split('/').some((part) => part === '.' || part === '..' || part.startsWith('.cq-'));
}

const hasExtension = (segment: string) => /[^.]\.[^.]+$/.test(segment);

/**
 * What the hosting site does with one request (decision 52), in the order of the architecture:
 * redirects, trailing slash, files, rewrites (only when no file matched). `uri` is the decoded
 * path, `args` the raw query string.
 */
export async function evaluate(
  config: CloudConfig,
  uri: string,
  args: string,
  fileExists: FileCheck,
): Promise<Evaluation> {
  const path = uri.startsWith('/') ? uri : `/${uri}`;
  const rules = compiled(config);
  const headers: Record<string, string> = {};
  for (const rule of rules.headers) {
    if (matchPattern(rule.pattern, path)) Object.assign(headers, rule.headers);
  }
  const none: Evaluation = { kind: 'serve', path: NONE_PATH, headers };
  // Cloud's own markers, and anything that could leave the deployment, are never served.
  if (reserved(path)) return none;

  for (const rule of rules.redirects) {
    const params = matchPattern(rule.pattern, path);
    if (!params) continue;
    let location = fill(rule.tokens, params, encodeParam, encodeLiteral);
    if (!ABSOLUTE.test(location)) location = location.replace(/^\/{2,}/, '/');
    return {
      kind: 'redirect',
      status: rule.status,
      location: withQuery(location, args, rule.destination.includes('?')),
    };
  }

  const cleanUrls = config.cleanUrls ?? true;
  const found = await resolveFile(path, cleanUrls, config.trailingSlash === true, fileExists);
  let rewritten: string | null = null;
  if (!found) {
    for (const rule of rules.rewrites) {
      const params = matchPattern(rule.pattern, path);
      if (!params) continue;
      const target = fill(
        rule.tokens,
        params,
        (value) => value,
        (value) => value,
      ).replace(/\/{2,}/g, '/');
      rewritten = target.startsWith('/') && !reserved(target) ? target : NONE_PATH;
      break;
    }
  }

  if (config.trailingSlash !== undefined && path !== '/' && (found || rewritten !== null)) {
    const last = path.split('/').filter(Boolean).pop() ?? '';
    if (!hasExtension(last)) {
      if (config.trailingSlash && !path.endsWith('/') && found !== path) {
        return { kind: 'redirect', status: 308, location: localLocation(`${path}/`, args) };
      }
      if (!config.trailingSlash && path.endsWith('/')) {
        return {
          kind: 'redirect',
          status: 308,
          location: localLocation(path.replace(/\/+$/, ''), args),
        };
      }
    }
  }
  return { kind: 'serve', path: found ?? rewritten ?? NONE_PATH, headers };
}

/** The file that answers a path: the exact file, `<path>.html` (clean URLs), `<path>/index.html`. */
async function resolveFile(
  path: string,
  cleanUrls: boolean,
  slashes: boolean,
  fileExists: FileCheck,
): Promise<string | null> {
  if (path === '/') return (await fileExists('/index.html')) ? '/index.html' : null;
  const trailing = path.endsWith('/');
  const base = trailing ? path.replace(/\/+$/, '') : path;
  if (!trailing && (await fileExists(path))) return path;
  if (cleanUrls && !trailing && (await fileExists(`${path}.html`))) return `${path}.html`;
  if (await fileExists(`${base}/index.html`)) return `${base}/index.html`;
  // With `trailingSlash: true` a flat `about.html` answers `/about/` too (it is where `/about` goes).
  if (cleanUrls && slashes && trailing && (await fileExists(`${base}.html`))) {
    return `${base}.html`;
  }
  return null;
}
