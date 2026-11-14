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

## Qué no cubre

La protección se aplica a los archivos de tu web. Esto sigue funcionando como antes:

- los [formularios](/es/forms/), la [analítica](/es/analytics/) y las lecturas públicas del [almacén clave-valor](/es/key-value-store/);
- las páginas de estado.

Un monitor o una [revisión web](/es/website-check/) de una dirección protegida ve la página de la contraseña, igual que cualquier visitante.

No se guardan las direcciones IP de los visitantes para esta función. La cookie no contiene datos personales y se establece solo después de introducir la contraseña, así que no necesita un aviso de consentimiento.
