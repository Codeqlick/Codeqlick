---
title: Referencia de la CLI
description: Todos los comandos y opciones de la herramienta de línea de órdenes codeqlick, con las variables de entorno y los códigos de salida para scripts y CI.
group: reference
order: 18
---

El comando `codeqlick` despliega webs y gestiona proyectos, compilaciones, analítica y el almacén clave-valor. No tiene dependencias y necesita Node 20 o posterior.

```sh
npx @codeqlick/cli <command>       # ejecútalo sin instalar
npm install --global @codeqlick/cli  # o instálalo y escribe: codeqlick <command>
```

## Proyecto y equipo

La mayoría de los comandos actúan sobre el proyecto enlazado en la carpeta actual por `codeqlick.json`. Puedes cambiarlo con estas opciones:

| Opción             | Qué hace                                             |
| ------------------ | ---------------------------------------------------- |
| `--team <slug>`    | El equipo que se usa. También `CODEQLICK_TEAM`.      |
| `--project <slug>` | El proyecto que se usa. También `CODEQLICK_PROJECT`. |
| `-h`, `--help`     | Muestra la ayuda.                                    |
| `-v`, `--version`  | Muestra la versión.                                  |

## Cuenta

| Comando                 | Qué hace                                               |
| ----------------------- | ------------------------------------------------------ |
| `login`                 | Inicia sesión. Abre tu navegador y apruebas un código. |
| `login --token <cqk_…>` | Guarda un [token de API](/es/api-tokens/) en su lugar. |
| `logout`                | Olvida el token guardado.                              |
| `whoami`                | Muestra tu cuenta y tus equipos.                       |

## Proyectos y despliegues

| Comando                       | Qué hace                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `init`                        | Enlaza esta carpeta con un proyecto y escribe `codeqlick.json`.                       |
| `deploy [folder]`             | Sube una carpeta ya compilada como un despliegue nuevo.                               |
| `deploy --prod`               | Además lo publica como producción. Sin esta opción el despliegue es una vista previa. |
| `deploy -m, --message <text>` | Un mensaje que se muestra en la consola.                                              |
| `deploy --url-only`           | Imprime solo la URL del despliegue, para scripts.                                     |
| `deployments`                 | Lista los despliegues del proyecto, el más reciente primero.                          |
| `promote <id>`                | Publica un despliegue anterior (su ID corto).                                         |
| `rollback`                    | Publica el despliegue anterior al actual.                                             |
| `open`                        | Abre la web publicada.                                                                |

Consulta [alojamiento estático](/es/static-hosting/) para saber qué se sube.

## Dominios

| Comando                  | Qué hace                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `domains`                | Lista los dominios del proyecto y sus estados.                |
| `domains add <domain>`   | Añade un dominio e imprime los registros DNS que debes crear. |
| `domains check <domain>` | Comprueba un dominio ahora.                                   |
| `domains rm <domain>`    | Elimina un dominio.                                           |

Consulta [dominios propios](/es/custom-domains/).

## Revisión web

| Comando                        | Qué hace                                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| `audit <url>`                  | Ejecuta la [revisión web](/es/website-check/).                   |
| `audit --min-score <n>`        | Termina con `1` por debajo de esta puntuación (0 a 100).         |
| `audit --fail-on <fail\|warn>` | Termina con `1` cuando una comprobación da ese resultado o peor. |
| `audit --json`                 | Imprime el informe como JSON.                                    |

## Compilaciones desde Git

| Comando                                                                                       | Qué hace                                                                                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `git`                                                                                         | Muestra el repositorio conectado y los ajustes de compilación.                                |
| `git connect <owner/repo>`                                                                    | Conecta un repositorio. Antes, instala la app de GitHub en la consola.                        |
| `git connect … --branch <name>`                                                               | La rama de producción (por defecto, la del repositorio).                                      |
| `git connect … --root <dir> --install <cmd> --build <cmd> --output <dir> --node <20\|22\|24>` | Ajustes de compilación.                                                                       |
| `git disconnect`                                                                              | Deja de compilar desde Git.                                                                   |
| `env`                                                                                         | Lista las [variables de entorno](/es/environment-variables/) (solo los nombres).              |
| `env add <KEY> [value]`                                                                       | Guarda una. Sin valor, lo lee de la entrada estándar o lo pide sin mostrarlo en una terminal. |
| `env add … --production --preview`                                                            | Dónde se aplica. Ambos si no das ninguno.                                                     |
| `env rm <KEY>`                                                                                | Borra una.                                                                                    |
| `builds`                                                                                      | Lista las últimas compilaciones.                                                              |
| `builds start [--branch <name>]`                                                              | Compila el último commit de la rama y sigue el registro.                                      |
| `builds cancel <number>`                                                                      | Cancela una compilación en cola o en curso.                                                   |
| `logs [number]`                                                                               | Muestra el registro de una compilación (la última por defecto), en directo mientras corre.    |
| `--json`                                                                                      | Imprime la respuesta de la API, para `git`, `env` y `builds`.                                 |

Consulta [compilaciones desde Git](/es/builds-from-git/).

## Analítica y almacén clave-valor

| Comando                                        | Qué hace                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `analytics`                                    | Visitantes, páginas vistas, páginas principales y orígenes.                   |
| `analytics --period <24h\|7d\|30d\|90d\|365d>` | El periodo. Por defecto `7d`.                                                 |
| `kv [ls] [prefix]`                             | Lista las claves.                                                             |
| `kv get <key>`                                 | Imprime el valor de una clave como JSON.                                      |
| `kv set <key> <value>`                         | Guarda JSON, o texto cuando el valor no es JSON. `-` lee la entrada estándar. |
| `kv set … --ttl <seconds>`                     | Hace que la clave caduque.                                                    |
| `kv rm <key>`                                  | Borra una clave.                                                              |
| `kv incr <key> [--by <n>]`                     | Suma a un contador de forma atómica. Empieza en 0.                            |
| `--json`                                       | Imprime la respuesta de la API, para `analytics` y `kv`.                      |

Consulta [analítica web](/es/analytics/) y el [almacén clave-valor](/es/key-value-store/).

## Variables de entorno

| Variable                              | Qué hace                                                             |
| ------------------------------------- | -------------------------------------------------------------------- |
| `CODEQLICK_TOKEN`                     | Un token de API, para CI. Tiene prioridad sobre una sesión guardada. |
| `CODEQLICK_TEAM`, `CODEQLICK_PROJECT` | Igual que `--team` y `--project`.                                    |
| `CODEQLICK_API_URL`                   | La dirección de la API. Casi nunca la necesitarás.                   |

## Archivos

`codeqlick.json` guarda tu equipo, tu proyecto y la carpeta que se despliega. Súbelo al repositorio. `codeqlick login` guarda tu token en `~/.config/codeqlick/config.json`, que solo puede leer tu usuario.

## Códigos de salida

| Código | Significado                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`    | El comando funcionó.                                                                                                                                        |
| `1`    | El comando falló. También: una compilación falló o se canceló (`builds start`, `logs`), o la revisión web no alcanzó `--min-score` o `--fail-on` (`audit`). |
