---
title: Almacenamiento de objetos
description: Crea buckets compatibles con S3 para un proyecto de Codeqlick Cloud, genera claves de acceso y úsalas con cualquier cliente o SDK de S3.
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

## Claves de acceso

Crea una clave de acceso para un bucket, de solo lectura o de lectura y escritura. Un bucket tiene hasta 10 claves, y una clave solo funciona para su bucket. Codeqlick muestra el secreto **una sola vez**, así que cópialo cuando aparezca.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets/<bucket-id>/keys" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "uploads-server", "write": true }'
```

Al borrar una clave, deja de funcionar al instante.

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

Los buckets públicos y las reglas CORS aún no están disponibles.

## Límites

|                      | Plan gratuito | PRO       |
| -------------------- | ------------- | --------- |
| Buckets por proyecto | 2             | 10        |
| Tamaño de un bucket  | 1 GB          | 50 GB     |
| Objetos por bucket   | 100.000       | 1.000.000 |

Las subidas que superan la cuota se rechazan. La consola muestra el tamaño y el número de objetos de cada bucket.

## Borra un bucket

Un bucket debe estar vacío antes de borrarlo (si no, `409`). Al borrarlo también se borran sus claves.
