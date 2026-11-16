import type { SiteLocale } from '@/i18n/routing';
import { CONTACT_EMAIL } from '@/lib/site';
import { type LegalDocument, type LegalOwner, ownerLines } from './index';

/**
 * Codeqlick Cloud's terms (architecture 4.13). Their version is the API's CLOUD_TERMS_VERSION:
 * changing what they say means a new version there, so people accept them again.
 */
const UPDATED = { es: '17 de noviembre de 2026', en: '17 November 2026' } as const;
const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

function terms(owner: LegalOwner, locale: SiteLocale, hostingDomain: string): string {
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

## Suscriptores de tus páginas de estado

Si activas las **suscripciones por correo** de tu página de estado, tu equipo es el **responsable del tratamiento** de los correos de sus suscriptores y Codeqlick su **encargado del tratamiento** (artículo 28 del RGPD). Con estas condiciones nos encargas ese tratamiento:

- **Objeto y finalidad:** guardar el correo, el idioma, el estado y las fechas de cada suscriptor, confirmar su alta, enviarle los avisos que publica tu equipo y atender sus bajas. Nada más: no usamos esas direcciones para nada propio, no las cedemos ni las vendemos.
- **Instrucciones:** solo tratamos los datos siguiendo tus instrucciones, que das con los ajustes de la consola (activar o desactivar las suscripciones, publicar avisos, borrar suscriptores). Si una instrucción nos pareciera contraria a la ley, te lo diremos.
- **Confidencialidad:** solo acceden a los datos las personas de Codeqlick que lo necesitan para prestar el servicio, obligadas a guardar secreto.
- **Seguridad:** los datos viajan cifrados y se guardan en servidores de la Unión Europea con acceso restringido; las direcciones se muestran ocultas en parte en la consola y en los registros de eventos del equipo no aparecen. Si sufrimos una brecha que les afecte, te avisaremos sin dilación indebida.
- **Subencargado:** **OVHcloud**, que aloja el servicio, la base de datos y el correo en la Unión Europea. Te avisaremos antes de añadir otro, y podrás oponerte.
- **Supresión:** las suscripciones sin confirmar se borran a los nueve días, y las bajas a los 12 meses. Todo se borra cuando borras a los suscriptores, cuando borras el equipo o cuando te vas de Cloud.
- **Ayuda:** te ayudamos a atender los derechos de tus suscriptores (cada uno puede darse de baja con un clic, y tú puedes borrarlo desde la consola) y a cumplir tus obligaciones de seguridad; tienes a tu disposición la información necesaria para demostrarlo.

Tu equipo debe usar esta función solo para avisar del estado de su servicio y es quien responde ante sus suscriptores; la página muestra su nombre como responsable y enlaza nuestra [política de privacidad](/es/privacy).

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

## Your status pages' subscribers

If you turn on **email subscriptions** on your status page, your team is the **controller** of its subscribers' email addresses and Codeqlick is its **processor** (article 28 GDPR). With these terms you entrust that processing to us:

- **Subject and purpose:** keeping each subscriber's email, language, status and dates, confirming the sign-up, sending the notices your team posts and handling unsubscribes. Nothing else: we don't use those addresses for anything of our own, and we never hand them over or sell them.
- **Instructions:** we process the data only on your instructions, which you give through the console's settings (turning subscriptions on or off, posting notices, deleting subscribers). If an instruction seemed unlawful to us, we would tell you.
- **Confidentiality:** only the people at Codeqlick who need the data to provide the service can access it, and they are bound to secrecy.
- **Security:** the data travels encrypted and is kept on servers in the European Union with restricted access; addresses are partly hidden in the console and never appear in the team's events. If a breach affects them, we will tell you without undue delay.
- **Sub-processor:** **OVHcloud**, which hosts the service, the database and the email in the European Union. We will tell you before adding another, and you may object.
- **Deletion:** unconfirmed sign-ups are deleted after nine days and unsubscribed ones after 12 months. Everything is deleted when you delete the subscribers, when you delete the team or when you leave Cloud.
- **Assistance:** we help you answer your subscribers' rights (each can unsubscribe in one click, and you can delete them from the console) and meet your security obligations; the information needed to show it is available to you.

Your team must use this feature only to tell people about the state of its service, and it answers to its subscribers; the page shows its name as the controller and links our [privacy policy](/en/privacy).

## Leaving

You can delete projects, teams and tokens whenever you want from the console, and your account from "My account" (first hand over the ownership of teams you share).

## Contact

For any question, write to ${MAIL}.`;
}

export function cloudTermsDocument(
  owner: LegalOwner,
  locale: SiteLocale,
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
