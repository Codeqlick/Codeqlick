---
title: Deploy hooks
description: Recompila una rama de tu proyecto llamando a una URL secreta, para que un CMS headless o cualquier webhook publique contenido nuevo sin un commit.
group: hosting
order: 9
draft: true
---

Un deploy hook es una URL secreta. Cuando algo la llama, Codeqlick compila el último commit de una rama. Úsalo para recompilar tu web cuando cambia el contenido en un CMS headless, o desde cualquier servicio que pueda llamar a un webhook.

Los hooks necesitan un proyecto conectado a un repositorio con [compilaciones desde Git](/es/builds-from-git/).

## Crea un hook

```sh
codeqlick hooks add cms-publish --branch main
```

El comando imprime la URL del hook **una sola vez**:

```text
https://api.codeqlick.com/v1/cloud/hooks/cqd_…
```

Pégala en los ajustes de webhook de tu CMS. Codeqlick guarda solo un hash del token, así que no puede volver a mostrarte la URL. Si la pierdes, borra el hook y crea uno nuevo. También puedes crear hooks en la tarjeta **Deploy hooks** de la pestaña **Git** del proyecto.

Un hook tiene un nombre (único en el proyecto) y una rama. Sin `--branch` usa la rama de producción. Un proyecto tiene hasta 5 hooks. Los administradores del proyecto los crean y los borran. Un hook no se puede editar: crea uno nuevo y borra el anterior.

```sh
codeqlick hooks               # lista los hooks del proyecto
codeqlick hooks rm cms-publish
```

## Llámalo

Envía un `POST`. El cuerpo se ignora, así que da igual lo que envíe tu CMS.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/hooks/cqd_…"
```

La respuesta es `202` con la compilación en cola:

```json
{ "build": { "number": 12, "status": "QUEUED", "url": "https://cloud.codeqlick.com/…" } }
```

La compilación es de **producción** cuando la rama del hook es la rama de producción, y de **vista previa** en caso contrario. Cuenta para tus compilaciones del mes como cualquier otra.

Si tu CMS guarda muchas veces seguidas, Codeqlick cancela las compilaciones en cola de la misma rama cuando llega una más reciente, así que diez guardados se compilan una o dos veces.

## Errores

| Estado        | Significado                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `404`         | El hook se borró, nunca existió o se borró el proyecto.                                                       |
| `403`         | El proyecto está suspendido.                                                                                  |
| `409`         | El proyecto ya no está conectado o la rama ya no existe. La respuesta indica el motivo.                       |
| `429`         | Se agotaron las compilaciones del mes del equipo, o has llamado demasiado: 10 llamadas por minuto y por hook. |
| `502` o `503` | Falló GitHub o la app de GitHub no está disponible. Inténtalo más tarde.                                      |

## Revoca un hook

Al borrar un hook, su URL deja de funcionar al instante. Al desconectar el repositorio o borrar el proyecto se borran sus hooks. Cualquiera que tenga la URL puede lanzar compilaciones, así que trátala como una contraseña.

La lista de eventos del proyecto en la consola muestra cada llamada: el nombre del hook, el estado y el número de la compilación.
