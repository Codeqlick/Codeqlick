---
title: Avisos de compilación
description: Entérate cuando una compilación falle o termine bien. Envía avisos por email, Slack, Discord o un webhook propio con firma.
group: hosting
order: 10
---

Un proyecto puede avisar a las personas cuando terminan sus compilaciones, para que nadie tenga que mirar la consola.

## Canales

Añade hasta 5 canales por proyecto en su pestaña **Avisos**. Los propietarios y administradores del equipo los gestionan. Un canal tiene un nombre, un tipo y los eventos que quiere recibir.

| Tipo        | Adónde va                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| **Email**   | Miembros de tu equipo (de 1 a 10), cada uno en su idioma.                                               |
| **Slack**   | Un [incoming webhook](https://api.slack.com/messaging/webhooks) (`https://hooks.slack.com/services/…`). |
| **Discord** | El webhook de un canal (`https://discord.com/api/webhooks/…`).                                          |
| **Webhook** | Cualquier URL `https` tuya, en el puerto 443.                                                           |

Las URL de Slack, Discord y webhook contienen un secreto, así que Codeqlick las guarda cifradas y solo muestra el host y los últimos 4 caracteres. Para cambiar una, vuelve a introducirla.

## Eventos

- **Compilación fallida:** activado por defecto. Una compilación rechazada porque se agotaron las del mes cuenta como fallida.
- **Compilación correcta:** desactivado por defecto. El mensaje incluye la dirección del despliegue.
- **Vistas previas:** desactivado por defecto, lo que significa que solo avisan las compilaciones de producción. Actívalo para incluir las vistas previas.

Las compilaciones canceladas no avisan a nadie.

## Qué dice un mensaje

```text
❌ web · build #12 failed on main (a1b2c3d Fix header): The build exited with code 1
✅ web · main published: https://web.codeqlick.app
```

Cada mensaje enlaza a la compilación. Los mensajes de Slack y Discord usan el idioma elegido al crear el canal (`en` o `es`).

## Contenido del webhook

Un canal de tipo webhook recibe un `POST` con JSON:

```json
{
  "event": "build.failed",
  "project": { "slug": "web", "name": "Web" },
  "build": {
    "number": 12,
    "target": "production",
    "branch": "main",
    "commit": "a1b2c3d4e5f6…",
    "commitMessage": "Fix header",
    "author": "Ana",
    "pullRequest": null,
    "status": "FAILED",
    "error": "The build exited with code 1",
    "durationMs": 48213,
    "url": "https://cloud.codeqlick.com/…"
  },
  "deployment": null,
  "sentAt": "2026-11-14T10:15:00.000Z"
}
```

`deployment` es `{ "url": "…" }` cuando una compilación ha ido bien. La petición lleva dos cabeceras: `X-Codeqlick-Event` con el nombre del evento y `X-Codeqlick-Signature` con `sha256=` seguido del HMAC-SHA256 del cuerpo sin procesar, calculado con el secreto del canal. Codeqlick muestra el secreto (`cqn_…`) una sola vez, al crear el canal.

Comprueba la firma antes de fiarte de una petición:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function isValid(rawBody, header, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Tu endpoint debe responder con un `2xx` en menos de 10 segundos. No se siguen las redirecciones y solo se llama a direcciones públicas.

## Entrega

Cada canal recuerda su última entrega y la consola la muestra. Diez entregas fallidas seguidas desactivan el canal y envían un email a los administradores del equipo, una sola vez. **Enviar una prueba** manda un evento de ejemplo y muestra el resultado.
