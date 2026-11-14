---
title: Alojamiento estático
description: Cómo sirve Codeqlick Cloud tu web compilada: despliegues, vistas previas, rollbacks, aplicaciones de una página, qué se sube y los límites del plan gratuito.
group: hosting
order: 3
---

Codeqlick Cloud sirve una carpeta compilada de archivos estáticos: la salida de `astro build`, `vite build`, `next export` o HTML sencillo. Cada subida es un **despliegue**.

## Despliegues

Un despliegue es una copia inmutable de tu carpeta. No cambia nunca después de crearse. Cada despliegue tiene su propia dirección:

```text
https://<project>--<id>.codeqlick.app
```

`<id>` son los primeros 8 caracteres del ID del despliegue. Las direcciones de los despliegues siguen disponibles mientras Codeqlick conserve el despliegue, y se avisa a los buscadores de que no las indexen.

Despliega una carpeta con la CLI:

```sh
codeqlick deploy dist -m "Fix the header"
```

Sin `--prod`, el despliegue es una **vista previa**: puedes abrirla y compartirla, pero los visitantes de la dirección de tu proyecto no la ven. Con `--prod` pasa a ser además el despliegue de **producción**:

```sh
codeqlick deploy dist --prod
```

El despliegue de producción se sirve en `https://<project>.codeqlick.app` y en los [dominios propios](/es/custom-domains/) del proyecto.

También puedes crear un despliegue con la API. Envía la carpeta como un `tar.gz`:

```sh
tar -czf bundle.tar.gz -C dist .
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/deployments" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -F "bundle=@bundle.tar.gz" \
  -F "target=production" \
  -F "message=Fix the header"
```

También puedes añadir los campos `commit` y `branch`. Ambos se muestran en la consola. El ID de tu proyecto lo encuentras con `GET /v1/cloud/teams/<team>/projects`.

## Qué se sube

La CLI sube todo lo que hay en la carpeta excepto:

- los archivos y carpetas que empiezan por punto, salvo `.well-known/`;
- todo lo que coincida con una línea de un archivo `.codeqlickignore` en la carpeta que despliegas. Pon un patrón por línea; `*` es un comodín.

```text
*.map
drafts/*
```

Un despliegue se rechaza, y no se guarda nada, cuando:

- no tiene un `index.html` en su raíz;
- contiene algo que no sean archivos y carpetas normales (ni enlaces ni dispositivos);
- tiene más de 10.000 archivos, más de 100 MB descomprimido o más de 50 MB subidos;
- el almacenamiento de tu equipo superaría su límite;
- haces más de 30 despliegues por hora en el equipo.

La respuesta indica el motivo: `400` para una carpeta no válida, `413` para el tamaño y `429` para la frecuencia.

## Cómo se sirven los archivos

- Una petición a una carpeta sirve su `index.html`.
- `/about` sirve `about.html`, así que puedes enlazar sin la extensión.
- Cuando un archivo no existe, Codeqlick sirve tu `404.html` con estado 404, si tienes uno.
- Cuando tienes un `200.html`, se sirve en su lugar para cada ruta que falta. Las aplicaciones de una página lo usan para el enrutado en el cliente: copia el `index.html` de tu app como `200.html`.
- Los archivos bajo `/_astro/`, `/assets/` y `/_next/static/`, y cualquier archivo con un hash de contenido en su nombre, se guardan en caché un año. El HTML se revalida en cada visita.
- Cada respuesta lleva `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Strict-Transport-Security`. Las peticiones HTTP se redirigen a HTTPS.

Un proyecto sin despliegue de producción responde una página de "aquí no hay nada". Un proyecto suspendido responde una página de "suspendido".

## Rollbacks y promoción

La producción es un puntero a un despliegue. Para cambiarla, **promueve** otro despliegue:

```sh
codeqlick deployments        # los lista, el más reciente primero
codeqlick promote a1b2c3d4   # publica este
codeqlick rollback           # publica el anterior al actual
```

El cambio es atómico, así que un rollback surte efecto en un segundo y nadie ve una web a medio publicar.

## Despliegues conservados

Codeqlick conserva los últimos 20 despliegues de cada proyecto más el de producción. Los más antiguos se borran junto con sus archivos. Puedes borrar a mano cualquier despliegue que no sea el de producción, desde la consola o con `DELETE /v1/cloud/projects/<project-id>/deployments/<deployment-id>`.

Codeqlick no hace copia de seguridad de tus archivos fuente. Guarda tus fuentes en Git.

## Límites del plan gratuito

| Límite                           | Plan gratuito           |
| -------------------------------- | ----------------------- |
| Proyectos por equipo             | 10                      |
| Almacenamiento por equipo        | 1 GB                    |
| Tamaño de un despliegue          | 100 MB, 10.000 archivos |
| Tamaño de la subida              | 50 MB                   |
| Despliegues por hora, por equipo | 30                      |
| Dominios por proyecto            | 5                       |

El tráfico es de uso razonable. Cada dirección está limitada a 50 peticiones por segundo, con ráfagas de 100, y Codeqlick avisa a tu equipo antes de suspender nada por tráfico. Consulta [planes y límites](/es/plans-and-limits/) para ver la tabla completa.
