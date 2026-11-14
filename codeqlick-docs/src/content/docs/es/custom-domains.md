---
title: Dominios propios
description: Sirve tu proyecto de Codeqlick Cloud en tu propio dominio. Añádelo, verifica que es tuyo con un registro TXT, apúntalo a Codeqlick y obtén HTTPS automático.
group: hosting
order: 4
---

Un proyecto sirve su despliegue de producción en hasta 5 dominios tuyos. Cada uno se añade por separado: `example.com` y `www.example.com` son dos dominios.

## Añade un dominio

Con la CLI, desde la carpeta del proyecto:

```sh
codeqlick domains add docs.example.com
```

O en la consola, en la pestaña **Dominios** del proyecto. Codeqlick imprime los registros DNS que debes crear en tu proveedor de DNS.

No puedes añadir un dominio que esté bajo `codeqlick.app` o `codeqlick.com`, ni uno que ya use otro proyecto.

## 1. Verifica que es tuyo

Crea un registro `TXT` llamado `_codeqlick.<dominio>` con el valor que te muestra Codeqlick:

```text
_codeqlick.docs.example.com.  TXT  "cq-verify=3f9c1a7e…"
```

No se sirve nada de un dominio hasta que se verifica. Así se asegura Codeqlick de que nadie apunta a la plataforma un dominio que no es suyo.

## 2. Apúntalo a Codeqlick

- Para un subdominio como `docs.example.com`, crea un registro `CNAME` hacia `<proyecto>.codeqlick.app`.
- Para un dominio raíz como `example.com`, crea un registro `A` hacia la dirección IP que muestra la consola. Un dominio raíz no puede ser un `CNAME`.

```text
docs.example.com.  CNAME  web.codeqlick.app.
example.com.       A      <la dirección IP que muestra la consola>
```

Cuando el dominio resuelve a Codeqlick, se emite y se renueva automáticamente un certificado de Let's Encrypt. No tienes que subir nada.

## Estados

| Estado     | Significado                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `PENDING`  | El registro `TXT` aún no está verificado.                                                                |
| `VERIFIED` | La propiedad está verificada, pero el dominio todavía no apunta a Codeqlick o aún no responde por HTTPS. |
| `LIVE`     | El dominio sirve tu despliegue de producción por HTTPS.                                                  |
| `ERROR`    | El dominio dejó de resolver a Codeqlick. Se muestra el motivo. Se recupera solo cuando arreglas el DNS.  |

Codeqlick comprueba los dominios que no están en `LIVE` cada 10 minutos durante 7 días y después una vez al día. Comprueba los dominios `LIVE` cada 6 horas. Los cambios de DNS pueden tardar en llegar a todo el mundo, así que un dominio nuevo puede necesitar algo de tiempo.

Para comprobar uno ahora mismo:

```sh
codeqlick domains check docs.example.com
```

## Lista y elimina

```sh
codeqlick domains                       # tus dominios y sus estados
codeqlick domains rm docs.example.com   # deja de servirlo
```

Al eliminar un dominio, se despublica en menos de un minuto.

## API

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/domains" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "docs.example.com" }'
```

La respuesta incluye lo que debes añadir a tu DNS. `POST /v1/cloud/projects/<project-id>/domains/<domain-id>/check` comprueba un dominio ahora (10 por minuto).
