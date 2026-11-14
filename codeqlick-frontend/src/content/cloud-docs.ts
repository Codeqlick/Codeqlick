import type { AppLocale } from '@/i18n/routing';

/** Codeqlick Cloud's documentation (architecture 4.13), one Markdown page per language. */
export function cloudDocs(locale: AppLocale, domain: string, api: string): string {
  return locale === 'es' ? es(domain, api) : en(domain, api);
}

function es(domain: string, api: string): string {
  return `## Empezar

Necesitas Node 20 o posterior y una cuenta de Codeqlick.

1. Crea tu equipo en la [consola](/es/console).
2. Inicia sesión desde tu terminal (abre el navegador para que lo apruebes):

\`\`\`sh
npx @codeqlick/cli login
\`\`\`

3. En la carpeta de tu proyecto, enlázalo con un proyecto de Cloud (o crea uno):

\`\`\`sh
npx @codeqlick/cli init
\`\`\`

4. Compila tu web y despliégala:

\`\`\`sh
npm run build
npx @codeqlick/cli deploy dist --prod
\`\`\`

Tu web queda en \`https://<proyecto>.${domain}\`. Si lo usas a menudo, instálalo con \`npm i -g @codeqlick/cli\` y escribe solo \`codeqlick\`.

## La herramienta de línea de comandos

| Orden | Qué hace |
|---|---|
| \`codeqlick login\` | Inicia sesión aprobándolo en el navegador (\`--token <cqk_…>\` para usar un token) |
| \`codeqlick logout\` | Olvida el token guardado en este equipo |
| \`codeqlick whoami\` | Tu cuenta y tus equipos |
| \`codeqlick init\` | Enlaza la carpeta con un proyecto (escribe \`codeqlick.json\`) |
| \`codeqlick deploy [carpeta]\` | Sube la carpeta como un despliegue nuevo (\`--prod\` lo publica, \`-m "mensaje"\`) |
| \`codeqlick deployments\` | Los despliegues del proyecto, el más reciente primero |
| \`codeqlick promote <id>\` | Publica un despliegue anterior |
| \`codeqlick rollback\` | Vuelve al despliegue publicado antes del actual |
| \`codeqlick domains\` | Tus dominios (\`add\`, \`check\` y \`rm <dominio>\`) |
| \`codeqlick open\` | Abre la web publicada |

\`codeqlick.json\` guarda el equipo, el proyecto y la carpeta que se despliega; súbelo a tu repositorio. El token se guarda en \`~/.config/codeqlick/config.json\` (solo lo lee tu usuario).

## Despliegues y vistas previas

Cada \`deploy\` crea un despliegue que no cambia nunca, con su propia dirección: \`https://<proyecto>--<id>.${domain}\` (sin indexar en buscadores). Sin \`--prod\` es una **vista previa**; con \`--prod\` además pasa a ser la versión publicada en \`https://<proyecto>.${domain}\` y en tus dominios.

Para volver atrás, \`codeqlick rollback\` o el botón «Publicar» de cualquier despliegue en la consola. El cambio es instantáneo y atómico: nadie ve media web.

Guardamos los 20 últimos despliegues de cada proyecto, además del publicado. **No hacemos copia de tus archivos**: guarda tus fuentes.

Qué se sube: todo lo de la carpeta salvo los archivos y carpetas que empiezan por punto (excepto \`.well-known\`). Para excluir más, añade un \`.codeqlickignore\` con un patrón por línea (\`*.map\`, \`drafts/\`). Debe haber un \`index.html\` en la raíz.

## Compilar desde GitHub

En la pestaña **Git** del proyecto conecta GitHub (instala la app *Codeqlick Cloud* en los repositorios que quieras) y elige el repositorio y la rama de producción. Desde entonces:

- cada **push a la rama de producción** se compila y se publica;
- los push a **otras ramas** y las **pull requests** se compilan como vistas previas, y la pull request recibe un comentario con su dirección (las de forks no se compilan nunca);
- GitHub muestra el estado de cada commit (*Codeqlick Cloud*).

Ajusta la orden de instalación (\`npm ci\`), la de compilación (\`npm run build\`), la carpeta de salida (\`dist\`), la carpeta raíz y la versión de Node (20, 22 o 24). Las **variables de entorno** se guardan cifradas y no se pueden volver a leer; elige si son para producción, vistas previas o ambas. Cada compilación corre en un contenedor desechable de un servidor aparte, durante 15 minutos como máximo; el plan gratuito incluye 200 compilaciones al mes por equipo. Añade \`[skip cloud]\` al mensaje de un commit para no compilarlo.

Desde la terminal (CLI 0.3): \`codeqlick git connect <owner/repo>\` conecta el repositorio (tras instalar la app en la consola), \`codeqlick env add API_KEY\` guarda una variable (pide el valor sin mostrarlo, o lo lee de la entrada estándar), \`codeqlick builds start\` compila la rama y muestra el registro en directo, y \`codeqlick logs\` sigue la última compilación. Ambos terminan con código 1 si la compilación falla.

### Avisos de compilación

En la pestaña **Avisos** del proyecto elige a quién avisar cuando una compilación falla (o también cuando se publica): por **email** a personas del equipo, a un canal de **Slack** (un *incoming webhook*), a un canal de **Discord** (su webhook) o a un **webhook** propio. Por defecto solo avisa de las compilaciones de producción que fallan; puedes añadir las publicadas y las vistas previas. «Enviar una prueba» comprueba que llega.

Un webhook propio recibe un \`POST\` con JSON (\`event\`, \`project\`, \`build\`, \`deployment\`) y la cabecera \`X-Codeqlick-Signature: sha256=…\`, el HMAC-SHA256 del cuerpo con el secreto que se muestra al crearlo. Las direcciones se guardan cifradas. Si un aviso falla 10 veces seguidas, se desactiva y avisamos a los administradores del equipo.

## Analítica web

En la pestaña **Analítica** del proyecto enciéndela y añade esta línea al \`<head>\` de tus páginas:

\`\`\`html
<script defer src="${api}/cloud/analytics/script.js"></script>
\`\`\`

Cuenta las páginas vistas (también en aplicaciones de una página) y verás visitantes, páginas, fuentes (con \`utm_source\` o \`ref\`), navegadores, sistemas y dispositivos por periodo. Para contar una acción: \`codeqlick.track('signup')\`. No usa cookies ni almacenamiento local y no guarda direcciones IP: cada visitante cuenta una vez al día y no se le puede seguir de un día a otro. Los bots no cuentan y respeta «Do Not Track». Si tu web tiene Content-Security-Policy, permite \`https://api.codeqlick.com\` en \`script-src\` y \`connect-src\`. El plan gratuito cuenta 50.000 eventos al mes por equipo.

## Almacén clave-valor

Cada proyecto tiene un almacén de valores JSON (hasta 64 KB cada uno; 1.000 claves y 10 MB en el plan gratuito) para ajustes, interruptores y contadores. Se usa con un token de API (pestaña **KV** de la consola para verlo y editarlo):

\`\`\`bash
curl -X PUT ${api}/cloud/projects/<id>/kv/config:theme \\
  -H "Authorization: Bearer $CODEQLICK_TOKEN" -H "Content-Type: application/json" \\
  -d '{"value":{"dark":true},"ttl":86400}'
curl ${api}/cloud/projects/<id>/kv/config:theme -H "Authorization: Bearer $CODEQLICK_TOKEN"
curl -X POST ${api}/cloud/projects/<id>/kv/visits/incr -H "Authorization: Bearer $CODEQLICK_TOKEN" -d '{"by":1}'
\`\`\`

Las claves son letras, dígitos, \`.\`, \`_\`, \`-\` y \`:\`; \`ttl\` (segundos, opcional) hace que caduquen; \`incr\` suma de forma atómica. Las claves que empiezan por \`public:\` las puede leer cualquiera, sin token, en \`${api}/cloud/kv/<proyecto>/public:flags\`: así tu web lee interruptores desde el navegador. Nunca pongas un token en tus páginas.

Desde la terminal (CLI 0.4): \`codeqlick kv set config:theme '{"dark":true}'\`, \`codeqlick kv get config:theme\`, \`codeqlick kv incr visits\`, \`codeqlick kv ls\` y \`codeqlick analytics --period 30d\`.
## Bases de datos

En la pestaña **Bases de datos** crea una base de datos PostgreSQL 18 (1 por proyecto y 256 MB en el plan gratuito; 5 y 10 GB en PRO). Copia la cadena de conexión en ese momento: la contraseña no se vuelve a mostrar (puedes generar otra).

\`\`\`bash
psql "postgresql://cq_…:<contraseña>@pg.${domain}:5432/cq_…?sslmode=require"
\`\`\`

Solo admite conexiones con TLS; cada usuario solo entra en su base de datos, con 5 conexiones a la vez (20 en PRO) y consultas de hasta 60 s. Si pasa de su tamaño pasa a solo lectura y avisamos a los administradores. Hay una copia diaria guardada 7 días.

## Almacenamiento de archivos

En la pestaña **Almacenamiento** crea buckets compatibles con S3 (2 por proyecto, 1 GB y 100.000 objetos cada uno en el plan gratuito; 10, 50 GB y 1.000.000 en PRO) y claves de acceso para cada uno (de solo lectura o de lectura y escritura; el secreto se muestra una vez). Usa cualquier SDK de S3 con el endpoint \`https://s3.${domain}\`, la región \`garage\` y direcciones path-style (\`forcePathStyle: true\`). Para dar archivos a los navegadores, firma URLs desde tu servidor. De momento los archivos no tienen copia de seguridad.

## Rutas, 404 y aplicaciones de una página

- \`/sobre\` sirve \`sobre.html\` o \`sobre/index.html\`.
- Si existe \`404.html\`, se muestra para las páginas que no existen.
- Si existe \`200.html\`, se sirve para **cualquier** ruta que no exista: así funcionan las aplicaciones de una página (React Router, Vue Router…). Copia tu \`index.html\` como \`200.html\` al compilar.
- Los archivos de \`/assets/\`, \`/_astro/\` y \`/_next/static/\` se guardan en caché un año; el HTML se revalida siempre.

## Redirecciones, reescrituras y cabeceras

Declara reglas en el \`codeqlick.json\` de la carpeta donde ejecutas \`deploy\` (el mismo archivo que enlaza el proyecto; no se publica):

\`\`\`json
{
  "$schema": "https://api.codeqlick.com/v1/cloud/schema/codeqlick.json",
  "redirects": [{ "source": "/antiguo/:slug", "destination": "/blog/:slug", "status": 301 }],
  "rewrites": [{ "source": "/app/*", "destination": "/app/index.html" }],
  "headers": [{ "source": "/*", "headers": { "X-Frame-Options": "DENY" } }]
}
\`\`\`

Una redirección se aplica antes que cualquier archivo; una reescritura solo cuando ningún archivo coincide. Un archivo no válido rechaza el despliegue y dice la ruta del error. La consola muestra las reglas de cada despliegue, solo lectura.

## Formularios

Crea un formulario en la pestaña **Formularios** del proyecto y pega su HTML en tu página:

\`\`\`html
<form action="https://api.codeqlick.com/v1/cloud/forms/cqf_…" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Enviar</button>
</form>
\`\`\`

- Vale cualquier campo (hasta 30). Un campo \`email\` válido se usa como *responder a* del aviso.
- \`_redirect\` lleva al visitante a tu página de gracias (de tu proyecto); sin él vuelve a la misma página con \`?form=ok\`.
- \`_subject\` pone el asunto del email y \`_gotcha\` (oculto) frena los bots.
- Con \`fetch\` y JSON recibes \`{ ok: true }\`. Solo se aceptan envíos desde las direcciones de tu proyecto y tus dominios.
- Los envíos se guardan 180 días: búscalos, bórralos o descárgalos en CSV en la consola. El plan gratuito admite 1.000 envíos al mes por equipo.

## Dominios propios

En la consola (pestaña «Dominios») o con \`codeqlick domains add docs.tudominio.com\`:

1. **Demuestra que es tuyo** con un registro TXT \`_codeqlick.<dominio>\` con el valor que te mostramos.
2. **Apúntalo aquí**: un subdominio con un CNAME a \`<proyecto>.${domain}\`; un dominio raíz con un registro A a la IP que te mostramos.
3. En unos minutos tendrá su certificado HTTPS y quedará **activo**. Lo comprobamos solos cada 10 minutos, o al pulsar «Comprobar».

Hasta 5 dominios por proyecto. \`www.tudominio.com\` y \`tudominio.com\` son dos dominios.

## Monitores y página de estado

En **Monitores** del equipo:

- **Una URL:** la comprobamos cada 5 minutos (http o https, puertos estándar). Funciona si responde por debajo de 400 en 15 segundos; tras dos fallos seguidos avisamos por email a quien elijas, y otra vez cuando vuelve. También avisamos si su certificado caduca en menos de 14 días.
- **Un latido:** para tareas programadas (copias, colas, cron). Dale cada cuánto se ejecuta y un margen, y llama a su URL al terminar:

\`\`\`sh
curl -fsS https://api.codeqlick.com/v1/cloud/heartbeats/cqh_…            # acabó bien
curl -fsS "https://api.codeqlick.com/v1/cloud/heartbeats/cqh_…?status=fail"  # falló
\`\`\`

La **página de estado** del equipo (\`cloud.codeqlick.com/es/status/<equipo>\`) muestra los monitores que elijas con el nombre que quieras (nunca su URL), su disponibilidad en 90 días y las incidencias recientes. También hay JSON en \`/v1/cloud/status/<equipo>\` y una insignia en \`/v1/cloud/status/<equipo>/badge.svg\`. El plan gratuito admite 10 monitores por equipo.

## Desde GitHub Actions u otro CI

Crea un token en la consola (**Tokens**, mejor limitado al equipo) y guárdalo como secreto \`CODEQLICK_TOKEN\`:

\`\`\`yaml
- run: npm ci && npm run build
- run: npx @codeqlick/cli deploy dist --prod -m "\${{ github.event.head_commit.message }}"
  env:
    CODEQLICK_TOKEN: \${{ secrets.CODEQLICK_TOKEN }}
\`\`\`

Con \`codeqlick.json\` en el repositorio no hace falta más. Sin él, añade \`CODEQLICK_TEAM\` y \`CODEQLICK_PROJECT\`. En GitHub Actions se guardan el commit y la rama de cada despliegue.

## Revisión web en tu CI

\`codeqlick audit <url>\` revisa la rapidez, el móvil, Google y la seguridad de una página (la misma revisión que la web gratuita de Codeqlick) y termina con error por debajo de la nota que pidas, así que un paso de GitHub Actions puede frenar una pull request:

\`\`\`yaml
- run: |
    url=$(npx @codeqlick/cli deploy dist --url-only)
    npx @codeqlick/cli audit "$url" --min-score 80
  env:
    CODEQLICK_TOKEN: \${{ secrets.CODEQLICK_TOKEN }}
\`\`\`

\`--fail-on fail\` (o \`warn\`) falla también cuando alguna comprobación da ese resultado, y \`--json\` imprime el informe completo. También en la consola, en **Revisión web**, y por la API (\`POST /v1/cloud/audits\`). 20 por hora y equipo.

## Equipos y permisos

- **Propietario**: todo, incluido borrar el equipo y nombrar a otros propietarios.
- **Administrador**: miembros, invitaciones y proyectos.
- **Miembro**: despliega, gestiona dominios y lo ve todo.

Las invitaciones llegan por email y solo las acepta una cuenta con ese email. El historial del equipo guarda cada cambio, quién lo hizo y desde qué token.

## Límites del plan gratuito

| | |
|---|---|
| Equipos propios | 3 |
| Proyectos por equipo | 10 |
| Almacenamiento por equipo | 1 GB |
| Tamaño de un despliegue | 100 MB y 10.000 archivos (50 MB comprimido) |
| Despliegues | 30 por hora y equipo |
| Dominios por proyecto | 5 |
| Miembros por equipo | 10 |
| Tokens por persona | 20 |

El tráfico es de uso razonable: cada dirección admite 50 peticiones por segundo. Si lo superas a menudo te avisaremos antes de nada.

## API

Todo lo que hace la consola está en \`${api}/cloud\`, con \`Authorization: Bearer <token>\`. Un despliegue es un \`multipart/form-data\` con el campo \`bundle\` (la carpeta en \`.tar.gz\`) y, si quieres, \`target\` (\`preview\` o \`production\`), \`message\`, \`commit\` y \`branch\`:

\`\`\`sh
tar -czf site.tar.gz -C dist .
curl -fsS -H "Authorization: Bearer $CODEQLICK_TOKEN" \\
  -F bundle=@site.tar.gz -F target=production \\
  ${api}/cloud/projects/<id>/deployments
\`\`\`

Otras rutas: \`GET /cloud/me\`, \`GET /cloud/teams/<equipo>/projects\`, \`GET /cloud/projects/<id>/deployments\`, \`POST …/deployments/<id>/promote\`, \`GET|POST /cloud/projects/<id>/domains\`. Los errores siguen RFC 9457 (\`application/problem+json\`).

## Denunciar un abuso

Si ves una página alojada aquí que engaña, distribuye malware o infringe derechos, [denúnciala](/es/report).`;
}

function en(domain: string, api: string): string {
  return `## Getting started

You need Node 20 or later and a Codeqlick account.

1. Create your team in the [console](/en/console).
2. Sign in from your terminal (it opens the browser for you to approve):

\`\`\`sh
npx @codeqlick/cli login
\`\`\`

3. In your project's folder, link it to a Cloud project (or create one):

\`\`\`sh
npx @codeqlick/cli init
\`\`\`

4. Build your site and deploy it:

\`\`\`sh
npm run build
npx @codeqlick/cli deploy dist --prod
\`\`\`

Your site is live at \`https://<project>.${domain}\`. If you use it often, install it with \`npm i -g @codeqlick/cli\` and type just \`codeqlick\`.

## The command-line tool

| Command | What it does |
|---|---|
| \`codeqlick login\` | Signs in by approving it in the browser (\`--token <cqk_…>\` to use a token) |
| \`codeqlick logout\` | Forgets the token saved on this machine |
| \`codeqlick whoami\` | Your account and teams |
| \`codeqlick init\` | Links the folder to a project (writes \`codeqlick.json\`) |
| \`codeqlick deploy [folder]\` | Uploads the folder as a new deployment (\`--prod\` publishes it, \`-m "message"\`) |
| \`codeqlick deployments\` | The project's deployments, newest first |
| \`codeqlick promote <id>\` | Publishes an earlier deployment |
| \`codeqlick rollback\` | Goes back to the deployment published before the current one |
| \`codeqlick domains\` | Your domains (\`add\`, \`check\` and \`rm <domain>\`) |
| \`codeqlick open\` | Opens the published site |

\`codeqlick.json\` keeps the team, the project and the folder that is deployed; commit it. The token is saved in \`~/.config/codeqlick/config.json\` (readable only by your user).

## Deployments and previews

Each \`deploy\` creates a deployment that never changes, with its own address: \`https://<project>--<id>.${domain}\` (not indexed by search engines). Without \`--prod\` it is a **preview**; with \`--prod\` it also becomes the published version at \`https://<project>.${domain}\` and on your domains.

To go back, \`codeqlick rollback\` or the "Publish" button of any deployment in the console. The switch is instant and atomic: nobody sees half a site.

We keep the last 20 deployments of each project, plus the published one. **We don't back up your files**: keep your sources.

What is uploaded: everything in the folder except files and folders starting with a dot (but \`.well-known\`). To leave out more, add a \`.codeqlickignore\` with one pattern per line (\`*.map\`, \`drafts/\`). There must be an \`index.html\` at the root.

## Building from GitHub

In the project's **Git** tab, connect GitHub (install the *Codeqlick Cloud* app on the repositories you want) and choose the repository and the production branch. From then on:

- every **push to the production branch** is built and published;
- pushes to **other branches** and **pull requests** are built as previews, and the pull request gets a comment with its address (forks are never built);
- GitHub shows each commit's state (*Codeqlick Cloud*).

Adjust the install command (\`npm ci\`), the build command (\`npm run build\`), the output folder (\`dist\`), the root folder and the Node version (20, 22 or 24). **Environment variables** are stored encrypted and can't be read back; choose whether they are for production, previews or both. Each build runs in a throwaway container on a separate server, for at most 15 minutes; the free plan includes 200 builds a month per team. Add \`[skip cloud]\` to a commit's message to skip it.

From the terminal (CLI 0.3): \`codeqlick git connect <owner/repo>\` connects the repository (after installing the app in the console), \`codeqlick env add API_KEY\` saves a variable (it asks for the value without showing it, or reads standard input), \`codeqlick builds start\` builds the branch and shows the live log, and \`codeqlick logs\` follows the latest build. Both exit with code 1 when the build fails.

### Build notifications

In the project's **Notifications** tab choose who hears about a failed build (or a published one too): **email** to people of the team, a **Slack** channel (an incoming webhook), a **Discord** channel (its webhook) or a **webhook** of yours. By default only failed production builds are sent; you can add published builds and previews. "Send a test" checks it arrives.

A webhook of yours gets a JSON \`POST\` (\`event\`, \`project\`, \`build\`, \`deployment\`) with the header \`X-Codeqlick-Signature: sha256=…\`, the HMAC-SHA256 of the body with the secret shown when you create it. Addresses are stored encrypted. A notification that fails 10 times in a row is switched off and the team's admins are told.

## Web analytics

In the project's **Analytics** tab switch it on and add this line to your pages' \`<head>\`:

\`\`\`html
<script defer src="${api}/cloud/analytics/script.js"></script>
\`\`\`

It counts page views (single-page apps too) and shows visitors, pages, sources (with \`utm_source\` or \`ref\`), browsers, systems and devices per period. To count an action: \`codeqlick.track('signup')\`. It uses no cookies or local storage and keeps no IP addresses: a visitor is counted once a day and can't be followed from one day to the next. Bots are left out and "Do Not Track" is respected. If your site has a Content-Security-Policy, allow \`https://api.codeqlick.com\` in \`script-src\` and \`connect-src\`. The free plan counts 50,000 events a month per team.

## Key-value store

Each project has a store of JSON values (up to 64 KB each; 1,000 keys and 10 MB on the free plan) for settings, flags and counters. Use it with an API token (the console's **KV** tab shows and edits it):

\`\`\`bash
curl -X PUT ${api}/cloud/projects/<id>/kv/config:theme \\
  -H "Authorization: Bearer $CODEQLICK_TOKEN" -H "Content-Type: application/json" \\
  -d '{"value":{"dark":true},"ttl":86400}'
curl ${api}/cloud/projects/<id>/kv/config:theme -H "Authorization: Bearer $CODEQLICK_TOKEN"
curl -X POST ${api}/cloud/projects/<id>/kv/visits/incr -H "Authorization: Bearer $CODEQLICK_TOKEN" -d '{"by":1}'
\`\`\`

Keys are letters, digits, \`.\`, \`_\`, \`-\` and \`:\`; \`ttl\` (seconds, optional) makes them expire; \`incr\` adds atomically. Keys starting with \`public:\` can be read by anyone, without a token, at \`${api}/cloud/kv/<project>/public:flags\`: that's how your site reads flags from the browser. Never put a token in your pages.

From the terminal (CLI 0.4): \`codeqlick kv set config:theme '{"dark":true}'\`, \`codeqlick kv get config:theme\`, \`codeqlick kv incr visits\`, \`codeqlick kv ls\` and \`codeqlick analytics --period 30d\`.
## Databases

In the **Databases** tab create a PostgreSQL 18 database (1 per project and 256 MB on the free plan; 5 and 10 GB on PRO). Copy the connection string then: the password isn't shown again (you can make a new one).

\`\`\`bash
psql "postgresql://cq_…:<password>@pg.${domain}:5432/cq_…?sslmode=require"
\`\`\`

Only TLS connections are taken; each user only reaches its own database, with 5 connections at a time (20 on PRO) and queries of up to 60 s. Over its size it becomes read-only and the admins are told. It is dumped daily and kept 7 days.

## File storage

In the **Storage** tab create S3-compatible buckets (2 per project, 1 GB and 100,000 objects each on the free plan; 10, 50 GB and 1,000,000 on PRO) and access keys for each (read-only or read and write; the secret is shown once). Use any S3 SDK with the endpoint \`https://s3.${domain}\`, region \`garage\` and path-style addresses (\`forcePathStyle: true\`). To hand files to browsers, sign URLs from your server. Files aren't backed up yet.

## Routes, 404 and single-page apps

- \`/about\` serves \`about.html\` or \`about/index.html\`.
- If \`404.html\` exists, it is shown for pages that don't.
- If \`200.html\` exists, it is served for **any** route that doesn't exist: that's how single-page apps work (React Router, Vue Router…). Copy your \`index.html\` as \`200.html\` when building.
- Files under \`/assets/\`, \`/_astro/\` and \`/_next/static/\` are cached for a year; HTML is always revalidated.

## Redirects, rewrites and headers

Declare rules in the \`codeqlick.json\` of the folder where you run \`deploy\` (the same file that links the project; it is not published):

\`\`\`json
{
  "$schema": "https://api.codeqlick.com/v1/cloud/schema/codeqlick.json",
  "redirects": [{ "source": "/old/:slug", "destination": "/blog/:slug", "status": 301 }],
  "rewrites": [{ "source": "/app/*", "destination": "/app/index.html" }],
  "headers": [{ "source": "/*", "headers": { "X-Frame-Options": "DENY" } }]
}
\`\`\`

A redirect applies before any file; a rewrite only when no file matches. An invalid file rejects the deployment and names the path of the error. The console shows each deployment's rules, read-only.

## Forms

Create a form in the project's **Forms** tab and paste its HTML into your page:

\`\`\`html
<form action="https://api.codeqlick.com/v1/cloud/forms/cqf_…" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Send</button>
</form>
\`\`\`

- Any fields work (up to 30). A valid \`email\` field becomes the notification's reply-to.
- \`_redirect\` sends the visitor to your thank-you page (on your project); without it they go back to the same page with \`?form=ok\`.
- \`_subject\` sets the email's subject and \`_gotcha\` (hidden) stops bots.
- With \`fetch\` and JSON you get \`{ ok: true }\`. Only posts from your project's addresses and domains are accepted.
- Submissions are kept 180 days: search, delete or download them as CSV in the console. The free plan takes 1,000 submissions a month per team.

## Custom domains

In the console ("Domains" tab) or with \`codeqlick domains add docs.yourdomain.com\`:

1. **Prove it is yours** with a TXT record \`_codeqlick.<domain>\` with the value we show you.
2. **Point it here**: a subdomain with a CNAME to \`<project>.${domain}\`; a root domain with an A record to the IP we show you.
3. In a few minutes it gets its HTTPS certificate and becomes **live**. We check by ourselves every 10 minutes, or when you press "Check".

Up to 5 domains per project. \`www.yourdomain.com\` and \`yourdomain.com\` are two domains.

## Monitors and status page

In the team's **Monitors**:

- **A URL:** checked every 5 minutes (http or https, standard ports). Up when it answers below 400 within 15 seconds; after two failures in a row we email the people you choose, and again when it's back. We also warn when its certificate expires in under 14 days.
- **A heartbeat:** for scheduled jobs (backups, queues, cron). Give it how often it runs and a grace, and call its URL when it ends:

\`\`\`sh
curl -fsS https://api.codeqlick.com/v1/cloud/heartbeats/cqh_…            # it went well
curl -fsS "https://api.codeqlick.com/v1/cloud/heartbeats/cqh_…?status=fail"  # it failed
\`\`\`

The team's **status page** (\`cloud.codeqlick.com/en/status/<team>\`) shows the monitors you choose under the names you want (never their URL), their 90-day uptime and recent incidents. There's also JSON at \`/v1/cloud/status/<team>\` and a badge at \`/v1/cloud/status/<team>/badge.svg\`. The free plan takes 10 monitors per team.

## From GitHub Actions or another CI

Create a token in the console (**Tokens**, ideally restricted to the team) and save it as the secret \`CODEQLICK_TOKEN\`:

\`\`\`yaml
- run: npm ci && npm run build
- run: npx @codeqlick/cli deploy dist --prod -m "\${{ github.event.head_commit.message }}"
  env:
    CODEQLICK_TOKEN: \${{ secrets.CODEQLICK_TOKEN }}
\`\`\`

With \`codeqlick.json\` in the repository nothing else is needed. Without it, add \`CODEQLICK_TEAM\` and \`CODEQLICK_PROJECT\`. On GitHub Actions each deployment records its commit and branch.

## Website check in your CI

\`codeqlick audit <url>\` checks a page's speed, mobile, Google and security (the same check as Codeqlick's free website check) and exits with an error under the score you ask for, so a GitHub Actions step can stop a pull request:

\`\`\`yaml
- run: |
    url=$(npx @codeqlick/cli deploy dist --url-only)
    npx @codeqlick/cli audit "$url" --min-score 80
  env:
    CODEQLICK_TOKEN: \${{ secrets.CODEQLICK_TOKEN }}
\`\`\`

\`--fail-on fail\` (or \`warn\`) also fails when any check has that result, and \`--json\` prints the whole report. Also in the console, under **Website check**, and through the API (\`POST /v1/cloud/audits\`). 20 an hour per team.

## Teams and permissions

- **Owner**: everything, including deleting the team and making others owners.
- **Admin**: members, invitations and projects.
- **Member**: deploys, manages domains and sees everything.

Invitations arrive by email and only an account with that email can accept them. The team's history keeps every change, who made it and through which token.

## Free plan limits

| | |
|---|---|
| Teams owned | 3 |
| Projects per team | 10 |
| Storage per team | 1 GB |
| One deployment | 100 MB and 10,000 files (50 MB compressed) |
| Deployments | 30 an hour per team |
| Domains per project | 5 |
| Members per team | 10 |
| Tokens per person | 20 |

Traffic is fair use: each address takes 50 requests a second. If you go over it often we'll let you know before anything else.

## API

Everything the console does is at \`${api}/cloud\`, with \`Authorization: Bearer <token>\`. A deployment is a \`multipart/form-data\` with the field \`bundle\` (the folder as \`.tar.gz\`) and, optionally, \`target\` (\`preview\` or \`production\`), \`message\`, \`commit\` and \`branch\`:

\`\`\`sh
tar -czf site.tar.gz -C dist .
curl -fsS -H "Authorization: Bearer $CODEQLICK_TOKEN" \\
  -F bundle=@site.tar.gz -F target=production \\
  ${api}/cloud/projects/<id>/deployments
\`\`\`

Other routes: \`GET /cloud/me\`, \`GET /cloud/teams/<team>/projects\`, \`GET /cloud/projects/<id>/deployments\`, \`POST …/deployments/<id>/promote\`, \`GET|POST /cloud/projects/<id>/domains\`. Errors follow RFC 9457 (\`application/problem+json\`).

## Reporting abuse

If you find a page hosted here that deceives, spreads malware or infringes rights, [report it](/en/report).`;
}
