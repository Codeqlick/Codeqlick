---
title: Almacenamiento de objetos
description: Crea buckets compatibles con S3 para un proyecto de Codeqlick Cloud, genera claves de acceso, comparte archivos en buckets públicos y define reglas CORS.
group: services
order: 17
---

Un proyecto puede tener buckets compatibles con S3 para subidas, copias de seguridad y otros archivos. Vale cualquier cliente o SDK de S3.

## Crea un bucket

En la pestaña **Almacenamiento** del proyecto, crea un bucket. Un nombre tiene de 3 a 63 letras minúsculas, dígitos y guiones, y es único en todo Codeqlick Cloud. Los administradores del proyecto crean y borran buckets.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "acme-uploads" }'
```

O con la [CLI](/es/cli/):

```sh
codeqlick buckets create acme-uploads
codeqlick buckets ls
```

`codeqlick buckets ls` muestra el tamaño y los objetos de cada bucket frente a su cuota, si es público, sus orígenes CORS y su número de claves.

## Claves de acceso

Crea una clave de acceso para un bucket, de solo lectura o de lectura y escritura. Un bucket tiene hasta 10 claves, y una clave solo funciona para su bucket. Codeqlick muestra el secreto **una sola vez**, así que cópialo cuando aparezca.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets/<bucket-id>/keys" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "uploads-server", "write": true }'
```

Con la CLI, una clave es de solo lectura salvo que pases `--write`. Imprime una sola vez el ID de la clave de acceso y el secreto, con el endpoint y la región:

```sh
codeqlick buckets key create acme-uploads --name uploads-server --write
codeqlick buckets keys acme-uploads
codeqlick buckets key rm acme-uploads uploads-server
```

Al borrar una clave, deja de funcionar al instante. `codeqlick buckets key rm` acepta el ID de la clave, el ID de la clave de acceso o su nombre, y pregunta antes de borrar.

## Conecta un cliente

Usa estos ajustes:

| Ajuste                          | Valor                                                  |
| ------------------------------- | ------------------------------------------------------ |
| Endpoint                        | `https://s3.codeqlick.app`                             |
| Región                          | `garage`                                               |
| Direccionamiento                | Path-style (`https://s3.codeqlick.app/<bucket>/<key>`) |
| ID de clave de acceso y secreto | La clave que creaste                                   |

Con el SDK de AWS para JavaScript:

```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: 'https://s3.codeqlick.app',
  region: 'garage',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

await s3.send(new PutObjectCommand({ Bucket: 'acme-uploads', Key: 'hello.txt', Body: 'Hello' }));
```

Con la CLI de AWS:

```sh
aws s3 ls s3://acme-uploads --endpoint-url https://s3.codeqlick.app --region garage
```

Define antes `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`. Para los navegadores, firma URL prefirmadas de corta duración en tu propio servidor y entrégaselas a la página. No pongas claves de acceso en código del lado del cliente.

## Buckets públicos

Un bucket público permite que cualquiera descargue sus archivos sin clave. Úsalo para imágenes, descargas y otros recursos de una web. Para subir archivos sigue haciendo falta una clave con escritura.

Cada archivo de un bucket público tiene esta dirección:

```text
https://s3.codeqlick.app/_public/<bucket>/<key>
```

```sh
curl -I "https://s3.codeqlick.app/_public/acme-assets/images/logo.png"
```

La dirección pública nunca lista un bucket. Una ruta es un archivo, o el `index.html` de una carpeta cuando lo hay. Todo lo demás responde `404`.

> **Atención:** cualquiera que tenga la dirección puede leer todos los archivos de un bucket público. Guarda los archivos privados en un bucket aparte.

Los archivos HTML se abren aislados: no se ejecutan scripts y la página no tiene un origen propio. Los buckets públicos son para recursos, no para webs. Publica una web con el [alojamiento estático](/es/static-hosting/).

Actívalo en la pestaña **Almacenamiento** del proyecto con el interruptor **Lectura pública**. La consola te pide confirmación y después muestra la dirección pública para copiarla. O usa la CLI:

```sh
codeqlick buckets public acme-assets on
codeqlick buckets public acme-assets off
```

`on` pregunta antes, salvo que pases `--yes`, e imprime la dirección pública. `off` no pregunta. Los administradores del proyecto hacen públicos o privados los buckets.

|                               | Plan gratuito | PRO |
| ----------------------------- | ------------- | --- |
| Buckets públicos por proyecto | 1             | 10  |

Por encima del límite, la API responde `409`. Si tu equipo vuelve al plan gratuito, los buckets que ya son públicos siguen siéndolo. Un proyecto suspendido no puede hacer público un bucket.

## Reglas CORS

Un navegador solo puede llamar al bucket desde el origen de tu web si el bucket lo permite. Dale a un bucket una regla CORS y se aplica tanto a las peticiones S3 como a las lecturas públicas. El caso habitual es una subida desde el navegador: tu servidor firma una URL prefirmada de `PUT` y la página envía el archivo directamente al bucket.

| Campo           | Qué contiene                                                                                                     | Por defecto   |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| `origins`       | De 1 a 10 orígenes como `https://example.com` o `http://localhost:3000` (sin ruta), o `*` para cualquier origen. | Obligatorio   |
| `methods`       | De 1 a 5 entre `GET`, `HEAD`, `PUT`, `POST` y `DELETE`.                                                          | `GET`, `HEAD` |
| `headers`       | Hasta 20 cabeceras de petición que puede enviar el navegador, o `*`.                                             | `*`           |
| `exposeHeaders` | Hasta 20 cabeceras de respuesta que puede leer la página.                                                        | `ETag`        |
| `maxAge`        | Cuánto tiempo guarda el navegador la respuesta a su petición previa (preflight), de 0 a 86.400 segundos.         | 3.600         |

Defínela con la CLI. `set` sustituye la regla entera:

```sh
codeqlick buckets cors acme-uploads set https://example.com --methods GET,PUT
codeqlick buckets cors acme-uploads                 # muestra la regla
codeqlick buckets cors acme-uploads clear           # la elimina
```

`set` también acepta `--headers a,b` y `--max-age <seconds>`. En la consola, usa el formulario **CORS** del bucket: un origen por línea, los métodos como casillas, las cabeceras y la duración.

O usa la API. `PATCH` cambia los campos `public` y `cors` de un bucket y responde con el bucket cambiado. Envía `"cors": null` para quitar la regla.

```sh
curl -X PATCH "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets/<bucket-id>" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "cors": { "origins": ["https://example.com"], "methods": ["GET", "PUT"] } }'
```

La misma petición hace público un bucket con `{ "public": true }`. Los administradores del proyecto cambian los buckets. Un token de solo lectura no puede.

Con la regla de arriba, una página en `https://example.com` puede subir un archivo con una URL que firmó tu servidor:

```js
// La URL viene de tu servidor, firmada con getSignedUrl y un PutObjectCommand.
await fetch(presignedUrl, { method: 'PUT', body: file });
```

## Límites

|                      | Plan gratuito | PRO       |
| -------------------- | ------------- | --------- |
| Buckets por proyecto | 2             | 10        |
| Tamaño de un bucket  | 1 GB          | 50 GB     |
| Objetos por bucket   | 100.000       | 1.000.000 |
| Buckets públicos     | 1             | 10        |

Las subidas que superan la cuota se rechazan. La consola muestra el tamaño y el número de objetos de cada bucket.

## Borra un bucket

Un bucket debe estar vacío antes de borrarlo (si no, `409`). Al borrarlo también se borran sus claves.

```sh
codeqlick buckets rm acme-uploads
```

La CLI pregunta antes de borrar. En scripts y en CI, donde no hay terminal para preguntar, pasa `--yes`.
