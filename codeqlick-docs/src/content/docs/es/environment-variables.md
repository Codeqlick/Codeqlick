---
title: Variables de entorno
description: Da a tus compilaciones secretos y ajustes como variables de entorno. Elige producción, vistas previas o ambas, y gestiónalas en la consola o con la CLI.
group: hosting
order: 8
---

Las variables de entorno dan a una [compilación desde Git](/es/builds-from-git/) los valores que necesita, como una clave de API o la dirección de un CMS. Solo existen mientras corre la compilación. Una web estática no tiene entorno de ejecución, así que nunca llegan a tus visitantes, salvo que tu compilación las escriba en la web.

## Reglas

- Los nombres cumplen `[A-Z_][A-Z0-9_]*`, hasta 64 caracteres, como `PUBLIC_API_URL` o `CMS_TOKEN`.
- Los valores ocupan hasta 4 KB.
- Un proyecto tiene hasta 50 variables en el plan gratuito (200 en PRO).
- Cada variable se aplica a las compilaciones de **producción**, a las de **vista previa** o a ambas.
- Los valores se cifran y son **de solo escritura**. La consola y la CLI muestran nombres, nunca valores. Para cambiar un valor, vuelve a introducirlo.
- El registro de la compilación oculta los valores.

Un valor nuevo se aplica desde la siguiente compilación.

## Con la CLI

```sh
codeqlick env                      # nombres y destinos
codeqlick env add CMS_TOKEN        # pide el valor sin mostrarlo
codeqlick env add API_URL https://api.example.com --production
codeqlick env rm CMS_TOKEN
```

Sin `--production` ni `--preview`, una variable se aplica a ambos. Si omites el valor, la CLI lo pide sin eco en una terminal, o lee la entrada estándar, así los secretos no quedan en el historial de tu shell:

```sh
printf '%s' "$CMS_TOKEN" | codeqlick env add CMS_TOKEN --production
```

## Con la API

```sh
curl -X PUT "https://api.codeqlick.com/v1/cloud/projects/<project-id>/env" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "key": "CMS_TOKEN", "value": "s3cret", "production": true, "preview": false }'
```

`GET` en la misma ruta lista los nombres. `DELETE ...?key=CMS_TOKEN` elimina una. Solo los administradores del proyecto pueden cambiar variables.
