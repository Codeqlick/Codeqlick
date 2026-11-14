---
title: Analítica web
description: Cuenta las visitas a tu web sin cookies ni terceros. Añade un script y lee el informe en la consola, en la CLI o en la API.
group: services
order: 14
---

Codeqlick Cloud cuenta las visitas a tu proyecto sin cookies, sin almacenamiento local y sin enviar a tus visitantes a nadie más. El informe está en la consola, en la CLI y en la API.

## Actívala

La analítica viene desactivada. Los administradores del proyecto la activan en la pestaña **Analítica**. Mientras está desactivada, los eventos del proyecto se descartan.

Añade este script a tus páginas:

```html
<script defer src="https://api.codeqlick.com/v1/cloud/analytics/script.js"></script>
```

El script pesa menos de 1 KB. Envía una página vista cuando carga la página y en cada navegación de una aplicación de una sola página. No envía nada por `http:`, desde `localhost` ni cuando el navegador del visitante pide "No rastrear" (Do Not Track).

Si tu web tiene una Content-Security-Policy, permite `https://api.codeqlick.com` en `script-src` y en `connect-src`.

## Eventos propios

Cuenta cualquier otra cosa con `window.codeqlick.track`:

```js
document.querySelector('#signup').addEventListener('click', () => {
  window.codeqlick?.track('signup_click');
});
```

El nombre de un evento tiene hasta 40 caracteres: letras, dígitos, `_`, `-`, `.` y `:`.

## Qué se guarda

De cada evento, Codeqlick guarda el nombre del evento, la ruta de la página (sin parámetros de consulta ni fragmento), el host de origen cuando es otra web, la campaña (`utm_source` o `ref`), el navegador, el sistema operativo y el tipo de dispositivo (móvil, tableta u ordenador). También guarda un identificador de visitante: un hash de un secreto que cambia cada día, el proyecto, la dirección IP y el user agent del navegador.

Como ese secreto se borra al día siguiente, los identificadores no se pueden recalcular ni seguir de un día a otro. Una persona cuenta una vez al día. No se guarda ninguna dirección IP, ninguna cookie ni ningún país, así que no necesitas un aviso de cookies por esto.

Los eventos se guardan 365 días. Las visitas de bots no se cuentan. Solo se aceptan eventos de páginas de las direcciones de tu proyecto y de tus dominios verificados.

## Lee el informe

Con la CLI, desde la carpeta del proyecto:

```sh
codeqlick analytics                  # los últimos 7 días
codeqlick analytics --period 30d     # 24h, 7d, 30d, 90d o 365d
codeqlick analytics --json
```

Con la API:

```sh
curl "https://api.codeqlick.com/v1/cloud/projects/<project-id>/analytics?period=30d" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

El informe trae los totales (visitantes y páginas vistas), una serie por hora para `24h` y por día para los demás periodos, y el top 10 de páginas, orígenes, navegadores, sistemas operativos, dispositivos y eventos propios.

## Plan gratuito

50.000 eventos al mes por equipo (PRO: 1.000.000). Si te pasas, los eventos se descartan y los propietarios de tu equipo reciben un email ese mes.

## Privacidad

Tú decides medir tu web, así que eres el responsable del tratamiento de los datos. Codeqlick trata los eventos por tu cuenta, como indican las condiciones de Cloud.
