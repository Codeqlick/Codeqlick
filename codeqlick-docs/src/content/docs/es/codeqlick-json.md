---
title: codeqlick.json
description: Declara redirecciones, reescrituras, cabeceras, URL limpias y barra final de un despliegue en codeqlick.json, con validación antes de desplegar.
group: hosting
order: 6
draft: true
---

`codeqlick.json` declara cómo responde un despliegue a las peticiones: redirecciones, reescrituras, cabeceras de respuesta adicionales, URL limpias y barra final. Las reglas viajan con tu código y pertenecen a cada despliegue, así que un rollback restaura las reglas del despliegue al que vuelves.

## Un archivo, dos usos

La CLI ya usa `codeqlick.json` para recordar tu equipo, tu proyecto y tu carpeta. El mismo archivo admite las claves de reglas de abajo. Cuando la CLI reescribe el archivo, conserva las claves que no conoce, así que enlazar nunca borra tus reglas. Las claves desconocidas son un error, para que una errata como `redirect` no se quede sin hacer nada en silencio.

```json
{
  "$schema": "https://api.codeqlick.com/v1/cloud/schema/codeqlick.json",
  "team": "acme",
  "project": "web",
  "dir": "dist",
  "cleanUrls": true,
  "trailingSlash": false,
  "redirects": [{ "source": "/old/:slug", "destination": "/blog/:slug", "status": 301 }],
  "rewrites": [{ "source": "/app/*", "destination": "/app/index.html" }],
  "headers": [{ "source": "/*", "headers": { "Content-Security-Policy": "default-src 'self'" } }]
}
```

La línea `$schema` hace que editores como VS Code autocompleten y revisen el archivo.

`codeqlick deploy` envía el `codeqlick.json` de la carpeta desde la que lo ejecutas. Las compilaciones desde Git usan el de la carpeta raíz del proyecto. Si no hay ninguno de los dos, se usa un `codeqlick.json` en la raíz de los archivos subidos. El archivo nunca se sirve: `/codeqlick.json` responde `404`.

## Reglas

| Clave           | Qué hace                                                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cleanUrls`     | `true` (por defecto): `/about` sirve `about.html`. `false`: solo se sirven los archivos exactos y `<carpeta>/index.html`. La dirección con `.html` sigue funcionando en ambos casos.                                                                                        |
| `trailingSlash` | Sin definir (por defecto): responden tanto `/about` como `/about/`. `true`: `/about` redirige a `/about/` (308). `false`: `/about/` redirige a `/about`. Nunca se aplica a `/`, a rutas cuyo último segmento tiene extensión de archivo ni a rutas a las que nada responde. |
| `redirects`     | Una lista de `{ source, destination, status? }`. `status` es 301, 302, 307 o 308 (por defecto 308). `destination` es una ruta o una URL completa `http://` o `https://`. Se conservan los parámetros de consulta de la petición, salvo que el destino tenga los suyos.      |
| `rewrites`      | Una lista de `{ source, destination }`. Sirve otro archivo del despliegue y deja la dirección como está. El destino es una ruta dentro del despliegue: Codeqlick nunca descarga otra dirección.                                                                             |
| `headers`       | Una lista de `{ source, headers }`. Añade las cabeceras a las respuestas de las rutas que coinciden.                                                                                                                                                                        |

## Patrones

Un `source` es una ruta que empieza por `/`. Nunca contiene `?` ni `#`: los parámetros de consulta no se comparan. La comparación distingue mayúsculas de minúsculas.

- `:name` coincide con un segmento de la ruta.
- `*` y `:name*` coinciden con el resto de la ruta, incluso con nada: `/docs/*` también coincide con `/docs`.
- Un destino puede usar los mismos valores `:name` y `:splat` (lo que coincidió con `*`).

```json
{
  "redirects": [
    { "source": "/blog/:year/:slug", "destination": "/posts/:slug", "status": 301 },
    { "source": "/docs/*", "destination": "https://docs.example.com/:splat" }
  ]
}
```

Un origen puede tener como máximo 5 parámetros. Los orígenes que empiezan por `/__codeqlick/` o `/__cq_` están reservados, y se rechaza una regla cuyo origen es igual a su destino.

## Orden de evaluación

Para cada petición, Codeqlick aplica estos pasos y se detiene en el primero que responde:

1. `redirects`, en el orden del archivo. Gana la primera coincidencia, aunque exista un archivo con esa ruta.
2. `trailingSlash`.
3. Tus archivos: el archivo exacto, después `<ruta>.html` (con `cleanUrls`), después `<ruta>/index.html`.
4. `rewrites`, en el orden del archivo, solo cuando ningún archivo coincidió. Un archivo siempre gana a una reescritura.
5. El recurso por defecto: `200.html` y después `404.html`.

Para las aplicaciones de una sola página, una reescritura es una alternativa a `200.html`:

```json
{ "rewrites": [{ "source": "/app/*", "destination": "/app/index.html" }] }
```

## Cabeceras

Cada regla de `headers` que coincide añade sus cabeceras, en el orden del archivo. Cuando dos reglas definen la misma cabecera, gana la última. Las cabeceras se aplican a archivos y reescrituras, no a redirecciones.

Puedes definir estas cabeceras:

`Content-Security-Policy`, `Content-Security-Policy-Report-Only`, `Cache-Control`, `Permissions-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`, `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Link`, `X-Robots-Tag` y `Content-Language`.

Cualquier otra cabecera se rechaza. Codeqlick define por sí mismo `Strict-Transport-Security`, `X-Content-Type-Options` y `Referrer-Policy`, y un despliegue no puede debilitarlas. `Set-Cookie`, `Content-Type`, `Content-Length`, `Content-Encoding`, `Location` y `Host` no están permitidas. Una regla de `Cache-Control` sustituye al valor por defecto de esas rutas. `X-Robots-Tag` se añade junto a la de Codeqlick, así que las direcciones de los despliegues siguen ocultas a los buscadores.

Los valores son ASCII imprimible, de hasta 2 KB cada uno. Una regla tiene como máximo 20 cabeceras.

## Límites

|                                | Plan gratuito | PRO    |
| ------------------------------ | ------------- | ------ |
| Redirecciones más reescrituras | 100           | 2.000  |
| Reglas de cabeceras            | 30            | 200    |
| Tamaño del archivo             | 64 KB         | 256 KB |

## Valida antes de desplegar

```sh
codeqlick config check
```

Envía tu archivo a Codeqlick e imprime lo que está mal, con la ruta exacta:

```text
redirects[3].status: must be 301, 302, 307 or 308
headers[0].headers.Strict-Transport-Security: not an allowed header
redirects: 101 rules, the free plan allows 100
```

Cuando todo está bien imprime un resumen como `ok: 3 redirects, 1 rewrites, 2 header rules`. `codeqlick deploy` hace las mismas comprobaciones: un despliegue con un archivo no válido se rechaza y no se guarda nada. Una compilación desde Git cuyo archivo no es válido falla con el mismo mensaje en su registro.
