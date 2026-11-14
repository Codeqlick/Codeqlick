---
title: Tokens de API y CI
description: Crea un token de API para scripts y CI, envíalo a la API de Codeqlick Cloud y despliega desde GitHub Actions con CODEQLICK_TOKEN.
group: reference
order: 19
---

Un token de API permite que un script o un trabajo de CI use Codeqlick Cloud como si fueras tú, sin iniciar sesión en el navegador.

## Crea un token

En la consola, abre **Tokens** y crea uno:

- Ponle un nombre que reconozcas, como `github-actions`.
- Elige cuándo caduca: 30, 90 o 365 días, o nunca.
- Si quieres, restríngelo a un equipo. En cualquier otro equipo fallará.

El token empieza por `cqk_` y se muestra **una sola vez**. Cópialo en ese momento: Codeqlick guarda solo un hash y los primeros caracteres para reconocerlo. La consola muestra cuándo y desde qué dirección IP se usó cada token por última vez. Puedes tener hasta 20 tokens. Revocar un token lo elimina.

## Qué puede hacer un token

Un token actúa como tú, con tu rol en cada equipo. Puede desplegar y gestionar proyectos, despliegues, dominios, variables de entorno, compilaciones y los servicios de un proyecto. No puede gestionar miembros, invitaciones, otros tokens ni equipos: para eso tienes que haber iniciado sesión en la consola. Un token solo funciona con las rutas de `/v1/cloud`.

Cuando se desactiva tu cuenta, tus tokens dejan de funcionar al instante.

## Úsalo

Envía el token como bearer token:

```sh
curl https://api.codeqlick.com/v1/cloud/me \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

La respuesta lista tu cuenta y tus equipos. Los ID que necesites los encuentras en la consola o en las respuestas de `GET /v1/cloud/teams/<team>/projects`.

La CLI lee el token de `CODEQLICK_TOKEN`, o puedes guardar uno con `codeqlick login --token cqk_…`.

## Despliega desde GitHub Actions

Guarda el token como secreto del repositorio con el nombre `CODEQLICK_TOKEN` (Settings, Secrets and variables, Actions). Sube tu `codeqlick.json` al repositorio, o pasa `--team` y `--project`.

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci && npm run build
      - run: npx @codeqlick/cli deploy dist --prod -m "$GITHUB_SHA"
        env:
          CODEQLICK_TOKEN: ${{ secrets.CODEQLICK_TOKEN }}
```

Si conectas tu repositorio con las [compilaciones desde Git](/es/builds-from-git/), Codeqlick compila y despliega por ti y no necesitas este workflow.

## Mantén tus tokens a salvo

- Usa un token por cada uso y restríngelo al equipo que necesita.
- Pon una caducidad a los tokens que no uses a diario.
- No subas nunca un token al repositorio. Si se filtra uno, revócalo en la consola.
