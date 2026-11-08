# CLAUDE.md

Codeqlick's "basic website" template (Astro 7, static), in `codeqlick-sites/web-basica`. Managed
sites are built from here with their content from the platform (`site-builder`); custom websites
are a copy in their own repository. A site's content is `site/site.ts` and `site/images/`; changes
to the template affect every managed site.

## Rules

- **All content comes from `site/site.ts`** (type `Site` in `src/types.ts`). Don't write client
  texts in the components. If a client needs something new, add an optional field to `Site` and
  its component, so the other sites still build.
- Site texts in Spanish (Spain), in a warm and concrete tone. No promises the client can't keep.
  Documentation and code comments are in English.
- Exact dependency versions (`.npmrc` `save-exact=true`), latest stable. TypeScript 6.0.3.
- No cookies or third-party scripts (no embedded Google Maps, Analytics or pixels). If the client
  asks for them, a consent banner is needed and `src/pages/cookies.astro` must be updated.
- Accessibility: every image with a descriptive `alt`; 4.5:1 contrast of `primary` with
  `primaryText` and of `muted` with `background`/`surface`.
- Photos: optimised by Astro (`astro:assets`); upload 1600–2000 px JPG originals.
- Format with Prettier (`npm run format`); before finishing: `npm run check` and `npm run build`
  with the client's site and with every demo (`SITE_DIR=examples/<demo>`).

## Project in the Codeqlick panel

Each client site is a project in the panel. With its publish key (Admin → project), the Codeqlick
repository's `tools/codeqlick-brief.sh` gives the client's brief, `tools/codeqlick-tasks.sh` its
tasks, and `tools/codeqlick-draft.sh` sends the work summary as a draft update. The form uses the
_Formulario de la web_ key.
