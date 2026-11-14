---
title: Compilaciones desde Git
description: Conecta un repositorio de GitHub a un proyecto de Codeqlick Cloud. Cada push se compila y se publica, y cada pull request tiene su propia vista previa.
group: hosting
order: 7
---

Conecta un repositorio de GitHub a un proyecto y Codeqlick lo compila y lo despliega en cada push. Las pull requests reciben direcciones de vista previa y un comentario con el enlace.

## Conecta GitHub

1. Abre la pestaña **Git** del proyecto en la [consola](https://cloud.codeqlick.com) y pulsa **Conectar GitHub**. Solo pueden hacerlo los propietarios y administradores del equipo.
2. Instala la app de GitHub _Codeqlick Cloud_ en los repositorios que elijas. La instalación se hace en tu navegador.
3. Elige el repositorio y la **rama de producción**.

La app puede leer tu código y escribir estados de commit y comentarios en pull requests. No puede cambiar tu código.

Después puedes gestionar la conexión desde la CLI:

```sh
codeqlick git                                 # el repositorio y los ajustes de compilación
codeqlick git connect acme/web --branch main  # conecta un repositorio que la app puede ver
codeqlick git disconnect                      # deja de compilar desde Git
```

## Qué lanza una compilación

| Evento                                                                             | Resultado                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Push a la rama de producción                                                       | Una compilación de **producción**, publicada si va bien.   |
| Push a otra rama                                                                   | Una compilación de **vista previa** (puedes desactivarlo). |
| Pull request abierta, reabierta o actualizada desde una rama del mismo repositorio | Una compilación de vista previa con su propia dirección.   |

Las pull requests de forks no se compilan nunca, porque su código es de un desconocido. Se ignoran los borrados de ramas, las etiquetas y los commits cuyo mensaje contiene `[skip cloud]`. Una compilación más reciente de la misma rama cancela las que estaban en cola antes.

GitHub muestra en cada commit un estado llamado `Codeqlick Cloud`: pendiente y luego correcto, con la dirección del despliegue, o fallido, con un enlace a la compilación. Una pull request recibe un único comentario, que se actualiza con cada compilación, con la dirección de la vista previa y el estado.

## Ajustes de compilación

Todos los ajustes son opcionales. Cuando hay un valor por defecto, se indica:

| Ajuste                                   | Por defecto             | Opción de la CLI |
| ---------------------------------------- | ----------------------- | ---------------- |
| Carpeta raíz                             | la raíz del repositorio | `--root`         |
| Orden de instalación                     | `npm ci`                | `--install`      |
| Orden de compilación                     | `npm run build`         | `--build`        |
| Carpeta de salida                        | `dist`                  | `--output`       |
| Versión de Node                          | una de 20, 22 o 24      | `--node`         |
| Compilar otras ramas como vistas previas | activado                |                  |
| Compilar pull requests                   | activado                |                  |

```sh
codeqlick git connect acme/web --branch main --root site --build "npm run build:prod" --output out --node 24
```

Define [variables de entorno](/es/environment-variables/) para los secretos que necesite tu compilación.

## Compilaciones

Una compilación pasa de `QUEUED` a `RUNNING` y termina como `SUCCEEDED`, `FAILED` o `CANCELED`. Se ejecuta en un contenedor nuevo y aislado, con acceso a internet y sin acceso a nada más. Tiene 2 CPU y 2 GB de memoria, y puede durar como máximo 15 minutos en el plan gratuito. El equipo ejecuta una compilación a la vez.

Una compilación correcta despliega su carpeta de salida igual que `codeqlick deploy`, así que se aplican los mismos [límites](/es/static-hosting/). Las compilaciones se guardan 90 días y sus registros, 30. Un registro ocupa como máximo 1 MB: si es más largo, se conserva el final.

```sh
codeqlick builds                         # las últimas compilaciones
codeqlick builds start --branch main     # compila el último commit de la rama y lo sigue
codeqlick logs                           # el registro de la última compilación, en directo mientras corre
codeqlick builds cancel 12               # cancela una compilación en cola o en curso
```

`builds start` y `logs` terminan con el código `1` cuando la compilación falla o se cancela, así que un trabajo de CI puede esperar a una compilación.

## Plan gratuito

200 compilaciones al mes por equipo (se cuentan por mes natural, en hora de Madrid) y 15 minutos por compilación. Cuando se agotan las compilaciones del mes, las nuevas se rechazan con una nota en la consola y un estado de commit fallido. Consulta [planes y límites](/es/plans-and-limits/).

Para enterarte de las compilaciones fallidas, configura los [avisos de compilación](/es/build-notifications/).
