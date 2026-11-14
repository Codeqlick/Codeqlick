---
title: Planes y límites
description: Los límites del plan gratuito de Codeqlick Cloud y lo que amplía el plan PRO en alojamiento, compilaciones, formularios, monitores, analítica y datos.
group: reference
order: 20
---

Codeqlick Cloud tiene un plan gratuito y un plan PRO. Cada equipo tiene un plan. Todos los límites de abajo son por equipo, salvo que una fila diga otra cosa.

## Límites

|                                     | Gratuito | PRO       |
| ----------------------------------- | -------- | --------- |
| **Equipos y personas**              |          |           |
| Equipos de los que eres propietario | 3        | 3         |
| Equipos a los que perteneces        | 10       | 10        |
| Miembros por equipo                 | 10       | 50        |
| Tokens de API por persona           | 20       | 20        |
| **Alojamiento**                     |          |           |
| Proyectos por equipo                | 10       | 50        |
| Almacenamiento por equipo           | 1 GB     | 20 GB     |
| Tamaño de un despliegue             | 100 MB   | 500 MB    |
| Archivos en un despliegue           | 10.000   | 50.000    |
| Tamaño de la subida                 | 50 MB    | 50 MB     |
| Despliegues por hora                | 30       | 120       |
| Dominios propios por proyecto       | 5        | 20        |
| **Compilaciones**                   |          |           |
| Compilaciones al mes                | 200      | 3.000     |
| Minutos por compilación             | 15       | 30        |
| Variables de entorno por proyecto   | 50       | 200       |
| Canales de avisos por proyecto      | 5        | 20        |
| **Servicios**                       |          |           |
| Formularios por proyecto            | 3        | 20        |
| Envíos de formulario al mes         | 1.000    | 20.000    |
| Monitores                           | 10       | 50        |
| Revisiones web por hora             | 20       | 200       |
| Eventos de analítica al mes         | 50.000   | 1.000.000 |
| Claves clave-valor por proyecto     | 1.000    | 100.000   |
| Datos clave-valor por proyecto      | 10 MB    | 1 GB      |
| Bases de datos por proyecto         | 1        | 5         |
| Tamaño de una base de datos         | 256 MB   | 10 GB     |
| Conexiones por base de datos        | 5        | 20        |
| Buckets por proyecto                | 2        | 10        |
| Tamaño de un bucket                 | 1 GB     | 50 GB     |
| Objetos por bucket                  | 100.000  | 1.000.000 |

Los límites mensuales se cuentan por mes natural, en hora de Madrid. Codeqlick guarda los últimos 20 despliegues de cada proyecto más su despliegue de producción.

El tráfico es de uso razonable. Cada dirección está limitada a 50 peticiones por segundo, con ráfagas de 100, y Codeqlick avisa a tu equipo antes de suspender nada por tráfico.

## Consulta tu uso

La página **Uso** de la consola muestra tu plan, tus límites y lo que usas. Con la API:

```sh
curl "https://api.codeqlick.com/v1/cloud/teams/<team>/usage" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

## Pasa a PRO

Los propietarios de un equipo pasan a PRO en la página **Plan** de la consola. Muestra el precio mensual, más IVA, y te envía a Stripe para pagar. El equipo pasa a PRO en cuanto se completa el pago. Los propietarios también pueden gestionar la tarjeta, ver las facturas y cancelar desde la misma página, a través del portal de clientes de Stripe. Los administradores y los miembros pueden ver el plan.

Si un pago falla, el equipo sigue siendo PRO mientras Stripe reintenta y los propietarios reciben un email. Cuando termina una suscripción, el equipo vuelve al plan gratuito.

## Volver al plan gratuito

Volver no borra nada. Lo que supera los límites del plan gratuito sigue funcionando, pero no puedes añadir más: la API responde `409` e indica el límite. Los límites mensuales, como compilaciones, eventos de analítica y envíos de formulario, se aplican al instante.

## Cuando llegas a un límite

| Límite                                 | Qué ocurre                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Despliegues, almacenamiento, proyectos | Se rechaza la petición con un motivo claro (`400`, `409`, `413` o `429`).                   |
| Compilaciones en un mes                | Las compilaciones nuevas se rechazan y se marcan como fallidas, con una nota en la consola. |
| Envíos de formulario en un mes         | Los envíos reciben `429` y los propietarios reciben un email ese mes.                       |
| Eventos de analítica en un mes         | Los eventos se descartan y los propietarios reciben un email ese mes.                       |
| Tamaño de la base de datos             | La base de datos pasa a solo lectura hasta que vuelva a estar por debajo del límite.        |
| Tamaño de un bucket                    | Se rechazan las subidas que superan la cuota.                                               |
