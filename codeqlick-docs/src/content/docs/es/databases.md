---
title: Bases de datos
description: Crea una base de datos PostgreSQL gestionada para un proyecto de Codeqlick Cloud, conéctate por TLS desde tu app y conoce los límites de tamaño y copias.
group: services
order: 16
---

Un proyecto puede tener bases de datos PostgreSQL gestionadas. Cada una es una base de datos con su propio usuario, accesible desde internet por TLS en `pg.codeqlick.app`.

## Crea una base de datos

En la pestaña **Bases de datos** del proyecto, pulsa **Crear** y ponle un nombre. Los administradores del proyecto pueden crear, reiniciar y borrar bases de datos. Codeqlick muestra la cadena de conexión **una sola vez**, con la contraseña:

```text
postgresql://cq_0123456789abcdef:YOUR_PASSWORD@pg.codeqlick.app:5432/cq_0123456789abcdef?sslmode=require
```

El usuario y la base de datos tienen el mismo nombre. Codeqlick no guarda la contraseña, así que cópiala cuando se muestre. Si la pierdes, genera una nueva en la consola. Al hacerlo se sustituye la contraseña, así que actualiza la configuración de tu app.

También puedes usar la API:

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/databases" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "main" }'
```

La respuesta incluye una sola vez `password` y la `connectionUrl` completa.

## Conéctate

Solo se aceptan conexiones con TLS (`sslmode=require`), y el usuario solo puede acceder a su propia base de datos.

```sh
psql "postgresql://cq_0123456789abcdef:YOUR_PASSWORD@pg.codeqlick.app:5432/cq_0123456789abcdef?sslmode=require"
```

Guarda la cadena en una variable de entorno, como `DATABASE_URL`, para tu servidor o para tu [compilación](/es/environment-variables/). No la pongas en código que se ejecute en el navegador. Una web estática no debe hablar directamente con su base de datos: cualquiera que lea tu página podría leer la contraseña.

```js
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query('select now()');
```

## Límites

|                             | Plan gratuito | PRO   |
| --------------------------- | ------------- | ----- |
| Bases de datos por proyecto | 1             | 5     |
| Tamaño de una base de datos | 256 MB        | 10 GB |
| Conexiones                  | 5             | 20    |

Cada consulta se detiene a los 60 segundos.

Cuando una base de datos supera su tamaño, pasa a solo lectura y los administradores de tu equipo reciben un email. Cuando borras datos y vuelve a estar por debajo del límite, vuelve a poder escribirse. A partir del 150 % del tamaño, se rechazan las conexiones nuevas hasta que la base de datos vuelva a estar por debajo. Escribe a [hello@codeqlick.com](mailto:hello@codeqlick.com) si necesitas ayuda para liberar espacio.

## Copias de seguridad

Cada base de datos se vuelca cada día y los volcados se guardan 7 días. Por ahora se almacenan en el mismo servidor que las bases de datos, así que te protegen de errores, no de la pérdida del servidor. Haz tus propias copias de los datos que no puedas perder. Para restaurar un volcado, escribe a [hello@codeqlick.com](mailto:hello@codeqlick.com).

## Borra una base de datos

Al borrar una base de datos, se elimina al instante. Su último volcado diario se conserva 7 días.
