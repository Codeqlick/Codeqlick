---
title: Comentarios en vistas previas
description: Deja comentarios fijados en un punto de la vista previa de un despliegue, comenta en hilos, menciona a tu equipo y síguelo todo en la bandeja.
group: hosting
order: 11
---

Tu equipo puede comentar en la vista previa de un despliegue, con cada comentario fijado en una página y un punto de ella. Cada marca inicia un hilo. La pestaña **Comentarios** del proyecto reúne todos los hilos en una bandeja.

No se añade nada a tus archivos ni a las páginas que reciben tus visitantes. Los comentarios se abren en una página de Codeqlick en la propia dirección de la vista previa, y solo para los miembros del equipo que la abrieron desde la consola.

## Dónde funciona

Los comentarios solo funcionan en las direcciones de despliegue, como `https://web--1a2b3c4d.codeqlick.app`. Nunca funcionan en:

- la dirección de producción (`https://web.codeqlick.app`),
- los dominios propios,
- las direcciones de rama. Una dirección de rama pasa a un despliegue nuevo con cada push, así que sus marcas se moverían.

En esas direcciones, todas las páginas de comentarios responden `404`.

## Abre una vista previa para comentar

1. En la pestaña **Despliegues** del proyecto, pulsa **Comentar** en un despliegue.
2. La vista previa se abre en una pestaña nueva con una pequeña barra arriba.
3. Activa el modo comentario y haz clic en cualquier punto de la página.

También puedes abrir un hilo desde la pestaña **Comentarios** con **Abrir en la vista previa**.

Tienes que haber iniciado sesión en la consola. Un [token de API](/es/api-tokens/) no puede abrir la página de comentarios.

Si las vistas previas piden contraseña, la consola te deja entrar sin escribirla.

## Marcas e hilos

En modo comentario, un clic abre un cuadro en ese punto. Escribe tu comentario y envíalo. La marca no se mueve al desplazarte, porque se guarda como una posición en la página, no en la pantalla. Codeqlick también recuerda el elemento en el que hiciste clic, para desplazarse hasta él y resaltarlo.

Cada marca es un hilo: el primer comentario más sus respuestas. La barra muestra las marcas de la página en la que estás, y puedes navegar por la vista previa como siempre para comentar otras páginas. También muestra cuántos hilos hay abiertos.

- **Resuelve** un hilo cuando esté terminado. Cualquier miembro puede resolverlo o **Reabrirlo**.
- Las marcas resueltas se ocultan. Activa **Mostrar resueltos** para verlas de nuevo.
- Puedes borrar tus propios comentarios. Los administradores del equipo pueden borrar cualquiera. Al borrar el último comentario de un hilo se borra el hilo.

Los comentarios son texto plano. Nunca se muestran como HTML.

## Menciones

Escribe `@` en un cuadro de comentario para elegir a un miembro de tu equipo. Cada persona que mencionas recibe un email por ese comentario, en su idioma, con el comentario, la página y un enlace a la bandeja. Puedes mencionar hasta 10 personas por comentario. Nunca recibes un email por mencionarte a ti.

## La bandeja

La pestaña **Comentarios** del proyecto lista los hilos con la actividad más reciente primero. La pestaña muestra el número de hilos abiertos.

- Filtra por **Abiertos**, **Resueltos** o **Todos**.
- Cada hilo muestra su despliegue, su página y si se dejó con un ancho de escritorio o de móvil.
- Desde ahí respondes con el mismo selector `@`, resuelves, reabres o borras.
- **Abrir en la vista previa** abre la página con su marca.

Cuando la limpieza de cada hora borra un despliegue antiguo, sus hilos siguen en la bandeja, pero sus marcas ya no se pueden abrir.

Para leer los hilos abiertos con la API:

```sh
curl "https://api.codeqlick.com/v1/cloud/projects/<project-id>/comments?status=open" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

`status` es `open` (por defecto), `resolved` o `all`. La respuesta tiene hasta 200 hilos con sus comentarios, y `open`, el número de hilos abiertos.

## Las sesiones duran 2 horas

Al abrir una vista previa desde la consola recibes una sesión para ese despliegue que dura 2 horas. Cuando caduca, la página te lo dice. Vuelve a abrirla desde la consola con **Comentar** o **Abrir en la vista previa**.

Si dejas el equipo, tu sesión deja de funcionar al instante.

## Webs que impiden mostrarse en un marco

La página de comentarios muestra tu vista previa dentro de un marco de la misma dirección. Si tu web envía `X-Frame-Options: DENY` o `Content-Security-Policy: frame-ancestors 'none'`, la página no puede mostrarla y te pide que lo permitas.

Permite los marcos del mismo origen. En `codeqlick.json`:

```json
{
  "headers": [
    {
      "source": "/*",
      "headers": {
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'"
      }
    }
  ]
}
```

Otras webs siguen sin poder mostrar tus páginas en un marco.

## Límites

| Límite                           | Valor |
| -------------------------------- | ----- |
| Caracteres por comentario        | 2.000 |
| Comentarios por hilo             | 100   |
| Hilos por proyecto               | 2.000 |
| Menciones por comentario         | 10    |
| Comentarios por minuto y usuario | 30    |

Por encima de un límite, el comentario se rechaza con un mensaje claro. Los límites son los mismos en todos los planes.
