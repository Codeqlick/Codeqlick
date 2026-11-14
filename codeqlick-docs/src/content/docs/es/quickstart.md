---
title: Inicio rápido
description: Inicia sesión con la CLI de Codeqlick, enlaza una carpeta con un proyecto y despliega tu web compilada en una dirección pública en unos minutos.
group: start
order: 2
---

Esta página te lleva de cero a una web en línea. Necesitas Node 20 o posterior y una web compilada: una carpeta con un `index.html` en su raíz, como la salida de `astro build`, `vite build` o archivos HTML sencillos.

## 1. Inicia sesión

Crea tu equipo en la [consola](https://cloud.codeqlick.com) si no tienes uno y luego inicia sesión desde tu terminal:

```sh
npx @codeqlick/cli login
```

El comando abre tu navegador con un código corto. Comprueba que coincide con el de tu terminal y aprueba. La CLI guarda un token que dura 90 días.

Si usas la CLI a menudo, instálala una vez y escribe `codeqlick` en lugar de `npx @codeqlick/cli`:

```sh
npm install --global @codeqlick/cli
```

## 2. Enlaza la carpeta con un proyecto

En la carpeta de tu proyecto, ejecuta:

```sh
codeqlick init
```

Te pide tu equipo y un proyecto (puedes crear uno) y escribe un archivo `codeqlick.json`. Súbelo al repositorio: permite que tus compañeros y el CI desplieguen en el mismo proyecto.

## 3. Compila y despliega

```sh
npm run build
codeqlick deploy dist --prod
```

`dist` es la carpeta que se sube. La opción `--prod` lo publica. Sin ella, el despliegue es solo una vista previa. El comando imprime la dirección del despliegue y, con `--prod`, la del proyecto:

```text
✓ Deployment a1b2c3d4: https://web--a1b2c3d4.codeqlick.app
✓ Published: https://web.codeqlick.app
```

Tu web está en línea en `https://<proyecto>.codeqlick.app` con HTTPS.

## 4. Cambia algo y vuelve atrás

Despliega de nuevo después de cada cambio. Si un despliegue sale mal, publica el anterior:

```sh
codeqlick rollback
```

El cambio es instantáneo y atómico: los visitantes nunca ven media web.

## Siguientes pasos

- Lee cómo el [alojamiento estático](/es/static-hosting/) sirve tus archivos y qué límites se aplican.
- Sirve la web en [tu propio dominio](/es/custom-domains/).
- Deja que Codeqlick compile tu web en cada push con las [compilaciones desde Git](/es/builds-from-git/).
- Despliega desde CI con un [token de API](/es/api-tokens/).
