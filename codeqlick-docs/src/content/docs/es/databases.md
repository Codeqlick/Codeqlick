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

El usuario y la base de datos tienen el mismo nombre. Codeqlick no guarda la contraseña, así que cópiala cuando se muestre. Si la pierdes, genera una nueva en la consola o con `codeqlick db url`. Al hacerlo se sustituye la contraseña, así que actualiza la configuración de tu app.

También puedes usar la API:

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/databases" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "main" }'
```

La respuesta incluye una sola vez `password` y la `connectionUrl` completa.

## Desde la línea de comandos

La [CLI](/es/cli/) gestiona las bases de datos del proyecto enlazado en tu carpeta, o de `--project <slug>`. Cada comando acepta `--json`.

```sh
codeqlick db ls              # nombre, tamaño frente al límite, solo lectura, cadena de conexión
codeqlick db create main     # imprime una sola vez la URL de conexión completa
codeqlick db url main        # genera una contraseña nueva e imprime la URL una sola vez
codeqlick db psql main       # abre psql; te pide la contraseña
codeqlick db psql main --reset
codeqlick db rm main
```

- `db create` imprime la URL de conexión con su contraseña **una sola vez**. Cópiala en ese momento.
- `db url` **sustituye** la contraseña, porque Codeqlick no la guarda. Las apps que usan la contraseña anterior dejan de conectarse, así que pregunta antes.
- `db psql` ejecuta tu `psql` local, que debe estar instalado. Sin `--reset`, `psql` te pide la contraseña. Con `--reset`, la CLI genera antes una contraseña nueva, preguntando como `db url`, y se la pasa a `psql` con la variable de entorno `PGPASSWORD`, nunca en la línea de comandos.
- `db rm` pregunta antes de borrar la base de datos y todos sus datos.

Para saltarte la pregunta, pasa `--yes` (`-y`). Sin terminal, por ejemplo en CI, estos comandos se niegan salvo que pases `--yes`, para que un script nunca se quede esperando ni borre nada por accidente.

El nombre de una base de datos se busca primero como ID y después exactamente como nombre. Si dos bases de datos tienen el mismo nombre, usa el ID que muestra el error.

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
