// Builds the restaurant preset through a running builder with and without its English version
// (architecture 8.2) and checks the published files:
//   node english-test.mjs <url> <token> <sites dir>
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [base, token, sites] = process.argv.slice(2);
const auth = { Authorization: `Bearer ${token}` };
const { presets } = await (
  await fetch(`${base}/presets`, { headers: auth })
).json();
const preset = presets.find((item) => item.key === "restaurante");
assert.ok(preset, "restaurante preset");

const menu = {
  title: "Carta",
  categories: [
    {
      name: "Arroces",
      items: [
        { name: "Paella valenciana", price: "17 €", allergens: ["celery"] },
        {
          name: "Arroz negro",
          description: "Con sepia y alioli.",
          price: "18 €",
        },
      ],
    },
  ],
};
const news = {
  posts: [
    {
      slug: "menu-de-otono",
      title: "Nuevo menú de otoño",
      summary: "Arroz de setas y calabaza.",
      body: "Desde este **viernes**.",
      publishedAt: "2026-11-10T09:00:00.000Z",
      updatedAt: "2026-11-10T09:00:00.000Z",
      en: { title: "New autumn menu", body: "From this **Friday**." },
    },
  ],
};
const booking = {
  url: "https://citas.codeqlick.com/es/casa-lola",
  label: "Reservar mesa",
};

async function build(slug, content) {
  const response = await fetch(`${base}/build`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      preset: "restaurante",
      domains: [`${slug}.demo.codeqlick.com`],
      content: { ...content, url: `https://${slug}.demo.codeqlick.com` },
    }),
  });
  const result = await response.json();
  assert.equal(result.ok, true, JSON.stringify(result));
  return join(sites, slug, "current");
}

const read = (dir, file) => readFileSync(join(dir, file), "utf8");
const has = (text, pattern, what = String(pattern)) =>
  assert.ok(pattern.test(text), `missing ${what}`);
const hasNot = (text, pattern, what = String(pattern)) =>
  assert.ok(!pattern.test(text), `unexpected ${what}`);

// English on: the pages under /en, in English, linked both ways.
const en = await build("ci-english", {
  ...preset.content,
  menu,
  news,
  booking,
  english: true,
  en: {
    hero: {
      title: "Wood-fired paella, the way grandma Lola made it",
      facts: [{}, { label: "of orange wood" }],
    },
    services: { title: "Our menu", items: [{ name: "Valencian paella" }] },
    menu: {
      categories: [
        {
          name: "Rice dishes",
          items: [{}, { description: "With cuttlefish." }],
        },
      ],
    },
    booking: { label: "Book a table" },
  },
});
for (const file of [
  "en.html",
  "en/carta.html",
  "en/noticias.html",
  "en/noticias/menu-de-otono.html",
  "en/noticias/rss.xml",
  "en/aviso-legal.html",
  "en/privacidad.html",
  "en/cookies.html",
]) {
  assert.ok(existsSync(join(en, file)), `${file} is built`);
}
const home = read(en, "en.html");
has(home, /<html lang="en"/);
has(
  home,
  /<link rel="alternate" hreflang="es" href="https:\/\/ci-english\.demo\.codeqlick\.com\/"/,
);
has(
  home,
  /<link rel="alternate" hreflang="en" href="https:\/\/ci-english\.demo\.codeqlick\.com\/en"/,
);
has(
  home,
  /<link rel="alternate" hreflang="x-default" href="https:\/\/ci-english\.demo\.codeqlick\.com\/"/,
);
has(home, /Wood-fired paella, the way grandma Lola made it/);
// An English text left empty shows the Spanish one.
has(home, /Valencian paella/);
has(home, /Arroz negro/);
has(home, /of orange wood/);
has(home, /href="\/en\/carta"/);
has(home, /href="https:\/\/citas\.codeqlick\.com\/en\/casa-lola"/);
has(home, /Book a table/);
has(home, /<a class="lang" href="\/" hreflang="es" lang="es"/);
has(home, /Opening hours/);
const spanishHome = read(en, "index.html");
has(spanishHome, /<html lang="es"/);
has(spanishHome, /<a class="lang" href="\/en" hreflang="en" lang="en"/);
has(
  spanishHome,
  /hreflang="en" href="https:\/\/ci-english\.demo\.codeqlick\.com\/en"/,
);
has(spanishHome, /Paella a leña, como la hacía la abuela Lola/);
const carta = read(en, "en/carta.html");
has(carta, /Rice dishes/);
has(carta, /With cuttlefish\./);
has(carta, /Allergens:/);
has(carta, /Celery/);
const post = read(en, "en/noticias/menu-de-otono.html");
has(post, /New autumn menu/);
has(post, /From this <strong>Friday<\/strong>\./);
has(post, /Arroz de setas y calabaza\./);
has(post, /10 November 2026/);
has(read(en, "en/aviso-legal.html"), /Legal notice/);
has(read(en, "en/noticias/rss.xml"), /<language>en<\/language>/);
const sitemap = read(en, "sitemap-0.xml");
has(sitemap, /<loc>https:\/\/ci-english\.demo\.codeqlick\.com\/en<\/loc>/);
has(sitemap, /xhtml:link rel="alternate" hreflang="en"/);

// English off: the same content builds no English page and links none.
const es = await build("ci-spanish", {
  ...preset.content,
  menu,
  news,
  booking,
});
assert.equal(existsSync(join(es, "en.html")), false);
assert.equal(existsSync(join(es, "en")), false);
for (const file of readdirSync(es).filter((name) => name.endsWith(".html"))) {
  const html = read(es, file);
  hasNot(html, /hreflang/, `${file} has no hreflang`);
  hasNot(html, /href="\/en/, `${file} links no English page`);
  has(html, /<html lang="es"/);
}
hasNot(read(es, "sitemap-0.xml"), /\/en/);

// The editor's draft: English texts are marked for live editing under `en.`.
const draft = await fetch(`${base}/drafts`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    slug: "ci-english",
    preset: "restaurante",
    base: "/site-draft/ci-english-draft-key-01",
    content: {
      ...preset.content,
      url: "https://ci-english.demo.codeqlick.com",
      english: true,
      en: { hero: { title: "Wood-fired paella" } },
    },
  }),
});
assert.equal((await draft.json()).ok, true);
const draftHome = await (
  await fetch(`${base}/drafts/ci-english/en`, { headers: auth })
).text();
has(draftHome, /data-edit="en\.hero\.title"/);
has(draftHome, /data-edit="en\.hero\.text"/);
const draftSpanish = await (
  await fetch(`${base}/drafts/ci-english/`, { headers: auth })
).text();
has(draftSpanish, /data-edit="hero\.title"/);
await fetch(`${base}/drafts/ci-english`, { method: "DELETE", headers: auth });
console.log("english ok");
