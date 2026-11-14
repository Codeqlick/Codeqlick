---
title: Documentación de Codeqlick Cloud
description: Codeqlick Cloud aloja tus webs estáticas y añade formularios, analítica, clave-valor, bases de datos y almacenamiento. Descubre qué incluye y qué es gratis.
group: start
order: 1
---

Codeqlick Cloud es un conjunto de herramientas para desarrolladores de proyectos web. Compilas tu web, la despliegas desde tu terminal o desde Git y le añades servicios sin tener que gestionar un servidor.

## Qué incluye

- **[Alojamiento estático](/es/static-hosting/):** cada despliegue tiene su propia dirección, tú publicas uno de ellos y puedes volver atrás en un segundo.
- **[Dominios propios](/es/custom-domains/):** sirve tu web en tu propio dominio con un certificado HTTPS automático.
- **[Compilaciones desde Git](/es/builds-from-git/):** conecta un repositorio de GitHub y cada push se compila y se publica. Las pull requests tienen direcciones de vista previa.
- **[Formularios](/es/forms/):** envía un formulario HTML a Codeqlick y recibe cada envío por email y en la consola.
- **[Monitores y páginas de estado](/es/monitors-and-status-pages/):** comprobaciones de disponibilidad, latidos de tareas programadas y una página de estado pública.
- **[Analítica web](/es/analytics/):** cuenta visitas sin cookies.
- **[Almacén clave-valor](/es/key-value-store/):** un almacén pequeño al que se accede por HTTP, para ajustes, interruptores y contadores.
- **[Bases de datos](/es/databases/):** PostgreSQL gestionado.
- **[Almacenamiento de objetos](/es/object-storage/):** buckets compatibles con S3.
- **[La línea de órdenes `codeqlick`](/es/cli/):** todo lo anterior desde tu terminal y desde CI.

## Cómo se organiza

Trabajas en un **equipo**. Un equipo tiene **proyectos**, y cada proyecto es una cosa desplegable, como una web. El nombre de un proyecto se convierte en su dirección: un proyecto llamado `web` vive en `https://web.codeqlick.app`.

Todo lo que ves en la consola de [cloud.codeqlick.com](https://cloud.codeqlick.com) también está disponible con la CLI y con la API HTTP en `https://api.codeqlick.com/v1/cloud`. Los scripts y los trabajos de CI inician sesión con un [token de API](/es/api-tokens/).

## Qué es gratis

El plan gratuito no tiene periodo de prueba. Incluye 10 proyectos por equipo, 1 GB de almacenamiento por equipo, 200 compilaciones al mes, 1.000 envíos de formulario al mes, 50.000 eventos de analítica al mes y más. La página de [planes y límites](/es/plans-and-limits/) lista todos los límites y lo que amplía el plan PRO.

## Por dónde seguir

Sigue la [guía de inicio rápido](/es/quickstart/) para desplegar tu primera web en unos minutos.
