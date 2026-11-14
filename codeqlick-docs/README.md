# codeqlick-docs

Public documentation of Codeqlick Cloud, in English and Spanish, published at
https://docs.codeqlick.com. An Astro 7 static site with plain Markdown pages, its own search
index and no client framework. Spec: `docs/architecture.md` 4.13 ("Public documentation") and
decision 53. It has exactly the dependencies and versions of `codeqlick-sites/web-basica`
(its `package-lock.json` is that one with the package name changed): don't add packages.

## Commands

```bash
npm ci
npm run dev           # http://localhost:4321
npm run build         # dist/
npm run preview
npm run check         # astro check (TypeScript 6.0.3: astro check refuses 7.0)
npm run format        # Prettier; format:check in CI
npm run linkcheck     # after a build: links, anchors, metadata, EN/ES twins
```

## Adding a page

Create the same file in both languages (the build fails when a slug exists in only one):

```
src/content/docs/en/<slug>.md
src/content/docs/es/<slug>.md
```

Frontmatter (anything else is an error):

```yaml
---
title: Static hosting # the h1, sidebar entry and <title>
description: Deploy a folder and get a URL. # max 160 characters, <meta> and search
group: hosting # start | hosting | services | reference (sidebar group)
order: 10 # position inside the group
draft: false # optional, default false
---
```

- The page's `h1` comes from `title`: start the body at `##` (headings `##` and `###` make the
  "On this page" list and the search index, each with an anchor).
- `index.md` is the introduction, served at `/en/` and `/es/`; the rest at `/en/<slug>/`.
- Link to other pages with absolute paths: `[Quickstart](/en/quickstart/)`.
- Code blocks: put the language after the fence (` ```bash `).

## Drafts

`draft: true` leaves a page out of the build: no route, no sidebar entry, no search entry, no
sitemap line. A page and its twin must have the same `draft` value, and a published page must not
link to a draft one (`npm run linkcheck` fails). Pages of features that aren't merged yet are
drafts; remove the flag in the pull request that merges the feature.

## How it fits together

- `src/content.config.ts`: the `docs` collection (glob loader, schema above).
- `src/lib/docs.ts`: loads the collection, checks both languages have the same slugs, drops
  drafts, sorts by group and `order`.
- `src/pages/[lang]/[...slug].astro`: the pages; `src/pages/index.astro` is the language picker
  (a script chooses by `navigator.language`); `404.astro`; `search-[lang].json.ts` builds the
  search index; `public/search.js` is the search box (no dependencies).
- `src/lib/i18n.ts`: interface strings and sidebar group names in both languages.
- Brand tokens and fonts: `src/styles/global.css` (`public/fonts/` has the website's three
  variable woff2 files).
- Hosted by Cloud itself as the project `codeqlick-docs` (Builds from Git, root folder
  `codeqlick-docs`, `npm ci`, `npm run build`, output `dist`).
