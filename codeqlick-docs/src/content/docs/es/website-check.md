---
title: API de revisión web
description: Ejecuta la revisión web de Codeqlick desde la CLI, la API o GitHub Actions, y haz fallar una pull request cuando la puntuación baje de tu mínimo.
group: services
order: 13
---

La revisión web analiza una página pública en velocidad, uso en móvil, visibilidad en Google y seguridad, y le da una puntuación de 0 a 100 con consejos para cada problema. La misma revisión que se ejecuta en la web de Codeqlick está disponible para tu equipo como herramienta para desarrolladores.

## Desde la CLI

```sh
codeqlick audit https://web.codeqlick.app
```

Imprime la puntuación, las puntuaciones por categoría y cada problema que requiere atención. Estas opciones son útiles en scripts:

| Opción                   | Qué hace                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| `--min-score <n>`        | Termina con el código `1` cuando la puntuación es inferior a `n` (0 a 100). |
| `--fail-on <fail\|warn>` | Termina con el código `1` cuando una comprobación da ese resultado o peor.  |
| `--json`                 | Imprime el informe completo como JSON.                                      |

## En GitHub Actions

Despliega una vista previa y revísala antes de publicar. El paso falla, y con él la pull request, cuando la puntuación es inferior a 80:

```yaml
name: Preview and check
on: pull_request

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci && npm run build
      - run: |
          url=$(npx @codeqlick/cli deploy dist --url-only)
          npx @codeqlick/cli audit "$url" --min-score 80
        env:
          CODEQLICK_TOKEN: ${{ secrets.CODEQLICK_TOKEN }}
```

`deploy --url-only` imprime solo la dirección del despliegue nuevo. Crea el token en la consola y guárdalo como el secreto del repositorio `CODEQLICK_TOKEN`: consulta [tokens de API](/es/api-tokens/). La carpeta necesita un `codeqlick.json`, o pasa `--team` y `--project`.

## Con la API

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/audits" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://web.codeqlick.app", "teamSlug": "acme", "locale": "es" }'
```

La respuesta llega cuando termina la revisión, en menos de 60 segundos (si no, `504`):

```json
{
  "id": "…",
  "url": "https://web.codeqlick.app",
  "finalUrl": "https://web.codeqlick.app/",
  "score": 92,
  "categories": [
    {
      "key": "security",
      "name": "Security",
      "score": 85,
      "checks": [{ "id": "…", "status": "warn", "title": "…", "advice": "…" }]
    }
  ],
  "createdAt": "2026-11-14T10:15:00.000Z"
}
```

Una URL que no se puede abrir responde `422` con el motivo. Los informes se guardan 30 días: lístalos con `GET /v1/cloud/teams/<team>/audits` y lee uno con `GET /v1/cloud/audits/<id>`. La página **Revisión web** de la consola ejecuta una revisión y muestra las recientes.

## Límites

20 revisiones por hora y por equipo en el plan gratuito (PRO: 200). La revisión sigue las mismas reglas de descarga segura que los monitores: rechaza las direcciones privadas y reservadas.
