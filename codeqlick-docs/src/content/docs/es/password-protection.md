---
title: Protección con contraseña
description: Pide una contraseña a los visitantes antes de que vean las vistas previas de un proyecto, o toda la web, para enseñar trabajo en curso sin hacerlo público.
group: hosting
order: 5
draft: true
---

La protección con contraseña pide una contraseña a los visitantes antes de que vean tu web. Úsala para enseñar trabajo en curso a un cliente sin hacerlo público. Está disponible en todos los planes.

## Modos

| Modo       | Qué pide la contraseña                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `off`      | Nada. Es el valor por defecto.                                                                                  |
| `previews` | Todas las direcciones de despliegue, como `https://web--a1b2c3d4.codeqlick.app`.                                |
| `all`      | Las direcciones de despliegue, más producción: `https://web.codeqlick.app` y los dominios propios del proyecto. |

Un proyecto tiene una contraseña, de 8 a 128 caracteres. Los propietarios y administradores del equipo cambian el ajuste.

## Actívala

Con la CLI, desde la carpeta del proyecto:

```sh
codeqlick protect previews
```

La CLI pide la contraseña dos veces, sin mostrarla. En un script, pásala por una tubería:

```sh
printf '%s' "$SITE_PASSWORD" | codeqlick protect all --days 30
```

O usa la tarjeta **Protección con contraseña** de la pestaña **Ajustes** del proyecto en la consola.

Para ver el estado actual, o para desactivarla:

```sh
codeqlick protect
codeqlick protect off
```

Al desactivarla se borra la contraseña, así que tendrás que introducir una de nuevo para volver a activarla.

## Qué ven los visitantes

Un visitante de una dirección protegida ve una página con el nombre del proyecto y un campo de contraseña. Tras introducir la contraseña correcta, Codeqlick establece una cookie que dura 1, 7 o 30 días (7 por defecto; elígelo con `--days`). La cookie solo funciona en la dirección donde se estableció, así que un visitante de un proyecto protegido con `all` introduce la contraseña una vez por dirección.

Los intentos fallidos están limitados: 5 por minuto, por visitante y proyecto.

## Cambia la contraseña o el modo

Cambia la contraseña o el modo con el mismo comando. Una respuesta vacía conserva la contraseña actual, que es como cambias solo el modo o los días:

```sh
codeqlick protect all
```

Al cambiar la contraseña o el modo se cierra la sesión de todos los visitantes que habían entrado antes. Cambiar solo el número de días no lo hace. Un cambio llega a los visitantes en menos de un minuto.

## Miembros del equipo

Cuando abres una dirección protegida desde la consola, entras sin escribir la contraseña. El enlace es válido durante un minuto y funciona una sola vez.

## Acceso para automatización

Las pruebas de extremo a extremo en CI, los verificadores de enlaces y `curl` no pueden escribir una contraseña ni guardar una cookie. Para ellos, un proyecto puede tener un **token de acceso automático**: un secreto aparte que deja pasar una petición sin la contraseña. Cambiar la contraseña no lo afecta, y revocarlo no cierra la sesión de ningún visitante.

Créalo desde la carpeta del proyecto (pueden los propietarios y administradores del equipo):

```sh
codeqlick protect bypass
```

El comando imprime el token una sola vez, y solo el token, por la salida estándar. Todo lo demás sale por la salida de errores, así que puedes guardarlo como secreto en un solo paso:

```sh
codeqlick protect bypass | gh secret set CQ_BYPASS
```

También puedes usar **Generar** en la fila **Acceso para automatización** de la tarjeta **Protección con contraseña**. El token empieza por `cqb_` y no se puede volver a leer: si lo pierdes, genera uno nuevo. Generarlo de nuevo sustituye al anterior, que deja de funcionar al instante (en menos de un minuto si la petición estaba en caché). Un proyecto tiene un token.

Envía el token en la cabecera `X-Codeqlick-Bypass`, en cada petición:

```sh
curl -H "X-Codeqlick-Bypass: $CQ_BYPASS" https://web--a1b2c3d4.codeqlick.app/
```

En Playwright, configúralo una vez para toda la ejecución:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'https://web--a1b2c3d4.codeqlick.app',
    extraHTTPHeaders: { 'X-Codeqlick-Bypass': process.env.CQ_BYPASS ?? '' },
  },
});
```

Enviar la cabecera con `extraHTTPHeaders` la añade a **todas** las peticiones de la página, también las que van a otros orígenes (CDN, analítica, scripts de terceros), así que el token se filtraría a ellos. Para enviarla solo al host de tu proyecto, añádela con una ruta:

```ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('https://web--a1b2c3d4.codeqlick.app/**', (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          'x-codeqlick-bypass': process.env.CQ_BYPASS ?? '',
        },
      }),
    );
    await use(context);
  },
});
```

Las peticiones a cualquier otro host no se tocan. Usa el mismo host para cada dirección del proyecto que pruebes (añade una ruta por host).

El token funciona en todas las direcciones que piden la contraseña, para cualquier ruta y método: las direcciones de despliegue y, con `all`, producción y tus dominios propios. Es solo una cabecera: nunca lo pongas en una URL ni en una cookie. Solo se salta la contraseña, así que las redirecciones, reescrituras y cabeceras de tu `codeqlick.json` se siguen aplicando. Mientras la protección está desactivada no hace nada; al desactivar la protección el token se conserva y vuelve a funcionar cuando la activas de nuevo.

Para eliminarlo:

```sh
codeqlick protect bypass --revoke
```

`codeqlick protect` muestra si hay un token, sus primeros caracteres y cuándo se usó por última vez. Todos los miembros del equipo lo ven; solo los propietarios y administradores lo crean o lo revocan. Un token de API de solo lectura no puede.

Trátalo como una contraseña: guárdalo en los secretos de tu CI y no lo imprimas en los registros. Un token incorrecto simplemente se rechaza y nunca bloquea a nadie, así que nadie puede detener tus pruebas enviando tokens incorrectos. El token tiene 256 bits aleatorios, por lo que no se puede adivinar. Los [monitores](/es/monitors-and-status-pages/) y la [revisión web](/es/website-check/) no lo envían, así que siguen viendo la página de la contraseña; una herramienta que pueda enviar cabeceras personalizadas puede usarlo.

## Qué no cubre

La protección se aplica a los archivos de tu web. Esto sigue funcionando como antes:

- los [formularios](/es/forms/), la [analítica](/es/analytics/) y las lecturas públicas del [almacén clave-valor](/es/key-value-store/);
- las páginas de estado.

Un monitor o una [revisión web](/es/website-check/) de una dirección protegida ve la página de la contraseña, igual que cualquier visitante.

No se guardan las direcciones IP de los visitantes para esta función. La cookie no contiene datos personales y se establece solo después de introducir la contraseña, así que no necesita un aviso de consentimiento.
