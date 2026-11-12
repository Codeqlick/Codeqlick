import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL } from '@/lib/site';
import { type LegalDocument, type LegalOwner, ownerLines } from './index';

/**
 * Codeqlick Cloud's terms (architecture 4.13). Their version is the API's CLOUD_TERMS_VERSION:
 * changing what they say means a new version there, so people accept them again.
 */
const UPDATED = { es: '13 de noviembre de 2026', en: '13 November 2026' } as const;
const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

function terms(owner: LegalOwner, locale: AppLocale, hostingDomain: string): string {
  if (locale === 'es') {
    return `## Quién presta el servicio

Codeqlick Cloud (cloud.codeqlick.com) es un servicio de:

${ownerLines(owner, locale)}

## Qué es

Una plataforma para developers: equipos, tokens de API, una herramienta de línea de comandos y alojamiento de sitios web estáticos en \`<proyecto>.${hostingDomain}\` y en tus propios dominios. El plan gratuito tiene los límites que muestra la consola; podemos cambiarlos avisando con 30 días de antelación.

## Tu cuenta y tu equipo

Necesitas una cuenta de Codeqlick. Al crear un equipo o unirte a uno aceptas estas condiciones. Los propietarios del equipo responden de lo que publica el equipo y de quién tiene acceso. Guarda tus tokens como contraseñas: quien tenga uno actúa como tú.

## Lo que publicas

Lo que subes es tuyo y es tu responsabilidad. No está permitido publicar:

- phishing, páginas que suplanten a otros o que pidan datos con engaño;
- malware, software dañino o enlaces a él;
- contenido ilegal, o que infrinja derechos de otros (marcas, derechos de autor, imagen);
- contenido sexual explícito;
- spam, páginas de aterrizaje de spam o redirecciones engañosas;
- minería de criptomonedas en el navegador de los visitantes.

Tampoco se permite abusar del servicio (por ejemplo, usarlo como almacén de archivos o generar un tráfico desproporcionado sin avisarnos).

## Denuncias y suspensión

Cualquiera puede denunciar una página alojada en cloud.codeqlick.com/es/report. Revisamos cada denuncia. Si un proyecto incumple estas condiciones lo suspendemos: sus direcciones muestran un aviso y no admite despliegues. Avisamos a los propietarios con el motivo, y pueden responder para que lo revisemos. En casos graves o repetidos podemos borrar el proyecto o el equipo.

## Disponibilidad y copias

Hacemos lo posible por mantener el servicio en marcha, pero el plan gratuito no tiene garantía de disponibilidad. **No hacemos copia de los archivos que despliegas**: guarda tus fuentes y vuelve a desplegar si hace falta.

## Datos personales

Tratamos los datos de tu cuenta como explica la [política de privacidad](/es/privacy) de Codeqlick. Para los sitios que alojas, Nginx guarda un registro de cada visita (IP, dirección y navegador) durante 14 días por seguridad y para atender abusos; respecto a esos datos actuamos como **encargado del tratamiento** por cuenta de tu equipo. Lo que tus páginas hagan con los datos de sus visitantes es responsabilidad tuya.

Si usas los **formularios** de Cloud, guardamos lo que envían tus visitantes durante 180 días y lo mandamos por email a los miembros que elijas; también ahí actuamos como encargado del tratamiento por cuenta de tu equipo, que decide qué datos pide y debe informar a sus visitantes. No guardamos su IP.

## Baja

Puedes borrar proyectos, equipos y tokens cuando quieras desde la consola, y tu cuenta desde «Mi cuenta» (antes, cede la propiedad de los equipos que compartes).

## Contacto

Para cualquier duda, escribe a ${MAIL}.`;
  }
  return `## Who provides the service

Codeqlick Cloud (cloud.codeqlick.com) is a service of:

${ownerLines(owner, locale)}

## What it is

A platform for developers: teams, API tokens, a command-line tool and static website hosting at \`<project>.${hostingDomain}\` and on your own domains. The free plan has the limits the console shows; we may change them with 30 days' notice.

## Your account and your team

You need a Codeqlick account. Creating or joining a team means accepting these terms. A team's owners answer for what the team publishes and who has access. Keep your tokens like passwords: whoever has one acts as you.

## What you publish

What you upload is yours and your responsibility. You may not publish:

- phishing, pages that impersonate others or trick people into giving data;
- malware, harmful software or links to it;
- illegal content, or content that infringes others' rights (trademarks, copyright, likeness);
- sexually explicit content;
- spam, spam landing pages or deceptive redirects;
- cryptocurrency mining in visitors' browsers.

Abusing the service is not allowed either (for example, using it as file storage or sending disproportionate traffic without telling us).

## Reports and suspension

Anyone can report a hosted page at cloud.codeqlick.com/en/report. We review every report. If a project breaks these terms we suspend it: its addresses show a notice and it takes no deployments. We tell the owners why, and they can reply so we review it. In serious or repeated cases we may delete the project or the team.

## Availability and backups

We do our best to keep the service running, but the free plan has no availability guarantee. **We don't back up the files you deploy**: keep your sources and deploy again when needed.

## Personal data

We handle your account's data as Codeqlick's [privacy policy](/en/privacy) explains. For the sites you host, Nginx keeps a log of each visit (IP, address and browser) for 14 days for security and to handle abuse; for those data we act as **processor** on behalf of your team. What your pages do with their visitors' data is your responsibility.

If you use Cloud's **forms**, we keep what your visitors send for 180 days and email it to the members you choose; there too we act as processor on behalf of your team, which decides what data it asks for and must inform its visitors. We don't keep their IP.

## Leaving

You can delete projects, teams and tokens whenever you want from the console, and your account from "My account" (first hand over the ownership of teams you share).

## Contact

For any question, write to ${MAIL}.`;
}

export function cloudTermsDocument(
  owner: LegalOwner,
  locale: AppLocale,
  hostingDomain: string,
): LegalDocument {
  const es = locale === 'es';
  return {
    title: es ? 'Condiciones de Codeqlick Cloud' : 'Codeqlick Cloud terms',
    description: es
      ? 'Qué se puede publicar en Codeqlick Cloud, cómo tratamos las denuncias y tus datos.'
      : 'What can be published on Codeqlick Cloud, how we handle reports and your data.',
    updated: UPDATED[locale],
    markdown: terms(owner, locale, hostingDomain),
  };
}
