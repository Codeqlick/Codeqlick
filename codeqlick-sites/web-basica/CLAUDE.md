# CLAUDE.md

Plantilla "web básica" de Codeqlick (Astro 7, estática), en `codeqlick-sites/web-basica`. Las webs
gestionadas se compilan desde aquí con su contenido de la plataforma (`site-builder`); las webs a
medida son una copia en su propio repositorio. El contenido de una web es `site/site.ts` y
`site/images/`; los cambios en la plantilla afectan a todas las webs gestionadas.

## Reglas

- **Todo el contenido sale de `site/site.ts`** (tipo `Site` en `src/types.ts`). No escribas textos
  del cliente en los componentes. Si un cliente necesita algo nuevo, añade un campo opcional a
  `Site` y su componente, para que las demás webs sigan compilando.
- Textos de la web en español de España, tono cercano y concreto. Sin promesas que el cliente no
  pueda cumplir.
- Versiones exactas de dependencias (`.npmrc` `save-exact=true`), última estable. TypeScript 6.0.3.
- Sin cookies ni scripts de terceros (nada de Google Maps embebido, Analytics ni píxeles). Si el
  cliente los pide, hace falta un banner de consentimiento y actualizar `src/pages/cookies.astro`.
- Accesibilidad: cada imagen con `alt` descriptivo; contraste 4.5:1 de `primary` con
  `primaryText` y de `muted` con `background`/`surface`.
- Fotos: optimizadas por Astro (`astro:assets`); sube originales de 1600–2000 px en JPG.
- Formato con Prettier (`npm run format`); antes de terminar: `npm run check` y `npm run build`
  con la web del cliente y con las tres demos (`SITE_DIR=examples/<demo>`).

## Proyecto en el panel de Codeqlick

Cada web de cliente es un proyecto en el panel. Con su clave de publicación (Admin → proyecto):
`tools/codeqlick-brief.sh` del repositorio de Codeqlick da el brief del cliente,
`tools/codeqlick-tasks.sh` sus tareas y `tools/codeqlick-draft.sh` envía el resumen del trabajo
como borrador de novedad. El formulario usa la clave de _Formulario de la web_.
