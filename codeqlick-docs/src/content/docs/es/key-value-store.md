---
title: Almacén clave-valor
description: Cada proyecto tiene un pequeño almacén clave-valor por HTTP, para ajustes, interruptores y contadores compartidos por scripts, CI y webs estáticas.
group: services
order: 15
---

Cada proyecto tiene un almacén clave-valor. Úsalo para ajustes, interruptores de funcionalidades, contadores y datos que comparten scripts, trabajos de CI y servidores. Las claves que empiezan por `public:` puede leerlas cualquiera, así que una web estática puede leerlas desde el navegador.

## Claves y valores

- Una clave tiene de 1 a 256 caracteres: letras, dígitos, `.`, `_`, `-` y `:`.
- Un valor es cualquier JSON, de hasta 64 KB una vez serializado.
- Una clave puede caducar: define un `ttl` de 1 segundo a 365 días. Una clave caducada se lee como si no existiera.

## Con la CLI

Desde la carpeta del proyecto:

```sh
codeqlick kv set feature:new-header true
codeqlick kv set banner '{"text":"Maintenance on Friday"}' --ttl 86400
codeqlick kv get feature:new-header
codeqlick kv ls feature:
codeqlick kv incr visits:home --by 1
codeqlick kv rm feature:new-header
```

El valor se lee como JSON, o como texto cuando no es un JSON válido. Un `-` como valor lee la entrada estándar.

## Con la API

Inicia sesión con un token ([tokens de API](/es/api-tokens/)). El token de cualquier miembro del equipo puede leer y escribir.

```sh
BASE="https://api.codeqlick.com/v1/cloud/projects/<project-id>/kv"

# escribir (con un ttl opcional en segundos)
curl -X PUT "$BASE/feature:new-header" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "value": true, "ttl": 3600 }'

# leer
curl "$BASE/feature:new-header" -H "Authorization: Bearer $CODEQLICK_TOKEN"

# listar por prefijo
curl "$BASE?prefix=feature:&limit=50" -H "Authorization: Bearer $CODEQLICK_TOKEN"

# borrar
curl -X DELETE "$BASE/feature:new-header" -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

Un contador atómico evita condiciones de carrera. Una clave que no existe empieza en 0, y `by` es un entero (1 por defecto):

```sh
curl -X POST "$BASE/visits:home/incr" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "by": 1 }'
# { "key": "visits:home", "value": 42 }
```

Responde `409` cuando el valor existente no es un entero.

## Lecturas públicas

Una clave que empieza por `public:` la puede leer cualquiera, en `https://api.codeqlick.com/v1/cloud/kv/<project>/<key>`. La respuesta permite cualquier origen (CORS) y se guarda en caché 10 segundos.

```sh
curl "https://api.codeqlick.com/v1/cloud/kv/web/public:banner"
```

```js
const banner = await fetch('https://api.codeqlick.com/v1/cloud/kv/web/public:banner').then(
  (response) => (response.ok ? response.json() : null),
);
```

Cualquier otra clave, y un proyecto suspendido o borrado, responden `404`. No se puede escribir nada sin un token. No pongas nunca secretos en una clave `public:`. Las lecturas públicas están limitadas a 120 por minuto y por IP.

## Límites

|                     | Plan gratuito               | PRO     |
| ------------------- | --------------------------- | ------- |
| Claves por proyecto | 1.000                       | 100.000 |
| Datos por proyecto  | 10 MB                       | 1 GB    |
| Peticiones          | 600 por minuto y por origen |         |

Pasados los límites, una escritura responde `409`.
