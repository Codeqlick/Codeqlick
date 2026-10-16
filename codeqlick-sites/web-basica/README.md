# Web básica — plantilla de Codeqlick

Plantilla de una web de una página para negocios locales (peluquerías, restaurantes, clínicas,
talleres…): portada, servicios con precios, sobre nosotros, galería, opiniones, horario, contacto
con formulario, y aviso legal, privacidad y cookies. Estática (Astro), sin cookies, rápida y
preparada para buscadores (metadatos, sitemap, datos estructurados `LocalBusiness`).

## Cómo se usa

Vive en `codeqlick-sites/web-basica` del repositorio de Codeqlick. Las **webs gestionadas** (la
web básica) no se copian: su contenido está en la plataforma y `site-builder` las compila con esta
plantilla. Para una **web a medida**:

1. Copia esta carpeta a un repositorio nuevo del cliente.
2. Cambia `site/site.ts` (todo el contenido) y las fotos de `site/images/`. Si el negocio se parece
   a una de las demos, copia su carpeta: `cp -R examples/restaurante/. site/`.
3. Formulario: en el panel de Codeqlick, Admin → proyecto → _Formulario de la web_, activa el
   formulario y copia la clave en `form: { key: '…' }`. Pon la URL de producción en el proyecto:
   el formulario solo acepta envíos desde ella.
4. Revisa con el cliente los datos legales (`legal`) y los textos de `src/pages/aviso-legal.astro`
   y `src/pages/privacidad.astro`: son una base razonable, no asesoría jurídica.
5. Publica en el servidor con `deploy/sites/publish-site.sh` del repositorio de Codeqlick.

```bash
npm install
npm run dev                                   # http://localhost:4321 con site/
SITE_DIR=examples/peluqueria npm run dev      # una demo
npm run check && npm run build                # comprueba y genera dist/
```

## Demos

| Carpeta                 | Negocio                             | Publicada en                            |
| ----------------------- | ----------------------------------- | --------------------------------------- |
| `examples/peluqueria`   | Alba Estudio, peluquería (Sevilla)  | https://peluqueria.demo.codeqlick.com   |
| `examples/restaurante`  | Casa Lola, arrocería (Valencia)     | https://restaurante.demo.codeqlick.com  |
| `examples/fisioterapia` | Fisio Retiro, fisioterapia (Madrid) | https://fisioterapia.demo.codeqlick.com |

Son negocios ficticios (`demo: true`: el teléfono y WhatsApp no llaman a nadie y el formulario no
envía). Las fotos son de dominio público (CC0); ver `CREDITS.md` de cada demo.

## Qué incluye el precio de la web básica

Hasta seis servicios, una galería de seis fotos, tres opiniones, horario, formulario con aviso de
privacidad, botón de WhatsApp, textos legales, adaptación a móvil, SEO básico y dos rondas de
cambios. Lo que no está aquí (reservas online, tienda, blog, varios idiomas) es un extra.
