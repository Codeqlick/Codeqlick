---
title: Monitores y páginas de estado
description: Comprueba que tu web está activa, recibe un aviso por email cuando una tarea programada deja de ejecutarse y publica una página de estado para tu equipo.
group: services
order: 12
---

Los monitores te avisan cuando algo se cae. Un equipo puede tener 10 monitores en el plan gratuito (PRO: 50). Créalos en la consola, en la pestaña **Monitores** del equipo.

## Monitores HTTP

Un monitor HTTP pide una URL cada 5 minutos. Cuenta como activo cuando la dirección responde con un estado inferior a 400 en menos de 15 segundos.

- La URL usa `http` o `https`, en el puerto 80 o 443, sin credenciales.
- Se siguen las redirecciones, hasta 5.
- Se rechazan las direcciones que resuelven a redes privadas o reservadas.
- Codeqlick lee la caducidad del certificado como máximo una vez por hora y te avisa una vez cuando quedan menos de 14 días.

Un monitor pasa a **caído** tras dos comprobaciones fallidas seguidas.

## Monitores de latido

Un monitor de latido funciona al revés: tu tarea programada llama a Codeqlick cuando termina, y recibes un aviso cuando no lo hace. Úsalo para copias de seguridad, tareas cron y pipelines de CI.

Crea un monitor de latido con un **periodo** (de 1 minuto a 7 días) y un tiempo de **margen** (de 1 minuto a 1 día). Codeqlick te da una URL como `https://api.codeqlick.com/v1/cloud/heartbeats/cqh_…`. Llámala al final de la tarea:

```sh
./backup.sh && curl -fsS "https://api.codeqlick.com/v1/cloud/heartbeats/cqh_YOUR_KEY"
```

El monitor va con retraso cuando no llega ninguna llamada dentro del periodo más el margen. Para avisar de un fallo al instante, añade `?status=fail`:

```sh
./backup.sh || curl -fsS "https://api.codeqlick.com/v1/cloud/heartbeats/cqh_YOUR_KEY?status=fail"
```

Funcionan tanto `GET` como `POST`. Una clave acepta 30 llamadas por minuto.

## Estados y avisos

| Estado    | Significado                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| `UNKNOWN` | Aún no hay resultado.                                                               |
| `UP`      | Todo va bien.                                                                       |
| `DOWN`    | Dos comprobaciones fallidas seguidas, un latido con retraso o una llamada de fallo. |
| `PAUSED`  | Has desactivado el monitor.                                                         |

Cuando un monitor se cae y cuando se recupera, Codeqlick envía un email, en su idioma, a los miembros del equipo que hayas elegido (de 1 a 10). El email incluye el error y cuánto tiempo estuvo caído el monitor. Recibes como máximo un aviso por monitor cada 15 minutos en cada sentido. Las comprobaciones se guardan 90 días.

## Páginas de estado

Cada equipo puede publicar una página de estado en `https://cloud.codeqlick.com/es/status/<team>`. Eliges un título, una introducción opcional y los monitores que se muestran, en tu orden, cada uno con un nombre público. Los visitantes ven:

- el estado general: todos los sistemas operativos, caída parcial o caída grave;
- el estado actual de cada monitor y su disponibilidad en 90 días, una barra por día;
- las incidencias de los últimos 14 días.

La página nunca muestra la URL de un monitor. Un equipo sin una página activada responde `404`.

Los mismos datos están disponibles como JSON público, en caché durante 60 segundos, y como una pequeña insignia SVG que puedes poner en un README:

```sh
curl https://api.codeqlick.com/v1/cloud/status/<team>
```

```markdown
![Status](https://api.codeqlick.com/v1/cloud/status/<team>/badge.svg)
```
