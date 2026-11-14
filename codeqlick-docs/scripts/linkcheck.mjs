// Checks the built site (dist/) with Node only: every internal link and file reference resolves,
// every #anchor exists, every page has a title, description and canonical, and every page has its
// twin in the other language. Run after `npm run build`; exits 1 with the list of problems.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';

const SITE = 'https://docs.codeqlick.com';
const dist = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dist)) {
  console.error(`${dist} not found: run "npm run build" first.`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const problems = [];
const problem = (page, message) => problems.push(`${page}: ${message}`);

/** `dist/en/x/index.html` is `/en/x/`; `dist/404.html` is `/404.html`. */
function urlOf(file) {
  const rel = relative(dist, file).split('\\').join('/');
  return rel.endsWith('/index.html') || rel === 'index.html'
    ? '/' + rel.slice(0, -'index.html'.length)
    : '/' + rel;
}

/** The built file a path points to, or undefined. */
function fileFor(path) {
  const target = join(dist, path);
  if (!target.startsWith(dist)) return undefined;
  if (path.endsWith('/')) {
    const index = join(target, 'index.html');
    return existsSync(index) ? index : undefined;
  }
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = join(target, 'index.html');
  return existsSync(index) ? index : undefined;
}

function attributes(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<');

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    const ids = new Set();
    for (const m of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
      const attrs = attributes(m[0]);
      if (attrs.id) ids.add(attrs.id);
      if (attrs.name && m[0].toLowerCase().startsWith('<a')) ids.add(attrs.name);
    }
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

const pages = new Map(); // url -> { file, html }
for (const file of htmlFiles) pages.set(urlOf(file), { file, html: readFileSync(file, 'utf8') });

for (const [url, { file, html }] of pages) {
  const label = relative(dist, file);

  // Title, description and canonical.
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim();
  if (!title) problem(label, 'missing <title>');
  let description;
  let canonical;
  for (const m of html.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const attrs = attributes(m[0]);
    if (attrs.name === 'description') description = decode(attrs.content ?? '').trim();
    if (attrs.rel === 'canonical') canonical = attrs.href;
  }
  if (!description) problem(label, 'missing meta description');
  else if (description.length > 160) problem(label, `description is ${description.length} > 160`);
  if (url !== '/404.html') {
    if (!canonical) problem(label, 'missing canonical link');
    else if (canonical !== SITE + url)
      problem(label, `canonical ${canonical} is not ${SITE + url}`);
  }

  // Links and file references.
  for (const m of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const tag = m[0];
    const attrs = attributes(tag);
    for (const name of ['href', 'src']) {
      const raw = attrs[name];
      if (raw === undefined || raw === '') continue;
      let value = decode(raw);
      if (/^(mailto:|tel:|javascript:|data:)/i.test(value)) continue;
      if (value.startsWith(SITE)) value = value.slice(SITE.length) || '/';
      else if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(value)) continue; // external
      const [beforeHash, hash] = value.split('#');
      const pathPart = beforeHash.split('?')[0];
      let target;
      if (pathPart === '') target = file;
      else {
        const absolute = pathPart.startsWith('/')
          ? pathPart
          : posix.resolve(posix.dirname(url), pathPart);
        const keepSlash =
          pathPart.endsWith('/') && !absolute.endsWith('/') ? absolute + '/' : absolute;
        target = fileFor(decodeURI(keepSlash));
        if (!target) {
          problem(label, `${name}="${raw}" does not resolve to a built file`);
          continue;
        }
      }
      if (hash && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(hash))) {
        problem(label, `${name}="${raw}": no element with id "${hash}"`);
      }
    }
  }
}

// Every page of a language has its twin in the other (the start page and the 404 have none).
const langPages = (lang) =>
  [...pages.keys()].filter((u) => u.startsWith(`/${lang}/`)).map((u) => u.slice(lang.length + 1));
const en = new Set(langPages('en'));
const es = new Set(langPages('es'));
for (const rest of en) if (!es.has(rest)) problem(`/en${rest}`, `no Spanish twin /es${rest}`);
for (const rest of es) if (!en.has(rest)) problem(`/es${rest}`, `no English twin /en${rest}`);
if (!en.has('/')) problem('/en/', 'the introduction page is missing');

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) in ${dist}:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Link check passed: ${pages.size} pages, ${files.length} files.`);
