# Basic website — Codeqlick template

Template for a one-page website for local businesses (hair salons, restaurants, clinics,
workshops…): hero, services with prices, about us, gallery, reviews, opening hours, contact with a
form, and legal notice, privacy and cookies pages. Static (Astro), cookieless, fast and ready for
search engines (metadata, sitemap, `LocalBusiness` structured data).

The sites' own texts are in Spanish (Spain); this documentation is in English.

## How to use it

It lives in `codeqlick-sites/web-basica` in the Codeqlick repository. **Managed sites** (the basic
website) are not copied: their content is stored in the platform and `site-builder` builds them
with this template. For a **custom website**:

1. Copy this folder to a new repository for the client.
2. Change `site/site.ts` (all the content) and the photos in `site/images/`. If the business is
   similar to one of the demos, copy its folder: `cp -R examples/restaurante/. site/`.
3. Form: in the Codeqlick panel, Admin → project → _Formulario de la web_, turn the form on and
   copy its key into `form: { key: '…' }`. Set the production URL on the project: the form only
   accepts submissions from it.
4. Review the legal data (`legal`) and the texts of `src/pages/aviso-legal.astro` and
   `src/pages/privacidad.astro` with the client: they are a reasonable base, not legal advice.
5. Publish on the server with `deploy/sites/publish-site.sh` from the Codeqlick repository.

```bash
npm install
npm run dev                                   # http://localhost:4321 with site/
SITE_DIR=examples/peluqueria npm run dev      # a demo
npm run check && npm run build                # checks and generates dist/
```

## Demos

| Folder                  | Business                                                              | Published at                            |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| `examples/peluqueria`   | Alba Estudio, hair salon (Seville)                                    | https://peluqueria.demo.codeqlick.com   |
| `examples/restaurante`  | Casa Lola, rice restaurant (Valencia)                                 | https://restaurante.demo.codeqlick.com  |
| `examples/fisioterapia` | Fisio Retiro, physiotherapy (Madrid)                                  | https://fisioterapia.demo.codeqlick.com |
| `examples/portfolio`    | Nora Vidal, photographer (Bilbao)                                     | https://portfolio.demo.codeqlick.com    |
| `examples/despacho`     | Ortega & Sanz, law firm (Zaragoza)                                    | https://despacho.demo.codeqlick.com     |
| `examples/comercio`     | Flores Abril, florist (Granada)                                       | https://comercio.demo.codeqlick.com     |
| `examples/reformas`     | Reformas Duero, home renovations (Valladolid)                         | https://reformas.demo.codeqlick.com     |
| `examples/general`      | Brezo, shop and workshop (Oviedo): «Otro tipo de web», neutral design | https://general.demo.codeqlick.com      |

The order of the middle sections and their menu names are changed with `sections` and
`navLabels` (a portfolio shows the gallery first, «Trabajos», and «Sobre mí»).

News: `news: { posts }` (see `NewsPost` in `src/types.ts`, newest first) builds `/noticias`,
`/noticias/<slug>`, `/noticias/rss.xml`, a «Novedades» section on the home page and the header
link «Noticias»; without posts none of it exists. Post bodies use a small Markdown subset
(`src/lib/markdown.ts`); `examples/restaurante` has three posts.

They are fictional businesses (`demo: true`: the phone and WhatsApp buttons call no one and the
form sends nothing). The photos are public domain (CC0); see each demo's `CREDITS.md`.

## What the basic website price includes

Up to six services, a gallery of six photos, three reviews, opening hours, a form with a privacy
notice, a WhatsApp button, legal texts, mobile layout, basic SEO and two rounds of changes.
Anything not listed here (online bookings, shop, blog, several languages) is an extra.
