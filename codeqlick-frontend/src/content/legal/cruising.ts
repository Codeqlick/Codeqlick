import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL } from '@/lib/site';
import { type LegalDocument, type LegalOwner, ownerLines } from './index';

/** Cruising's own terms of use and privacy policy (architecture 4.15). */
export type CruisingLegalPage = 'cruising-terms' | 'cruising-privacy';

const UPDATED = { es: '15 de noviembre de 2026', en: '15 November 2026' } as const;
const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

function terms(owner: LegalOwner, locale: AppLocale): string {
  if (locale === 'es') {
    return `## Quién presta el servicio

Cruising (cruising.codeqlick.com) es un servicio de:

${ownerLines(owner, locale)}

## Qué es

Un directorio de lugares de encuentro entre hombres, con mapa y opiniones de personas adultas. No es una guía de turismo ni un servicio de citas: solo recoge información que aportan los miembros, que revisamos antes de publicarla.

## Solo para mayores de 18 años

Para proponer un lugar, opinar o denunciar declaras que tienes al menos 18 años (y la mayoría de edad de tu país, si es mayor). Puedes mirar el mapa y las fichas sin cuenta, pero este servicio habla de sexualidad adulta: si no eres adulto, no lo uses. Cerramos cualquier cuenta que creamos de un menor.

## Tu cuenta

Necesitas una cuenta verificada por correo y entrar en Cruising con tu fecha de nacimiento, las normas y tu consentimiento. Eres responsable de lo que hagas con ella.

## Lo que aportas

- Lugares que existan y que conozcas, con datos ciertos: nombre, tipo, ubicación, descripción y mejores horas.
- **Nunca** cerca de colegios, parques infantiles ni lugares frecuentados por menores. Si dudamos, lo rechazamos.
- Opiniones sinceras y respetuosas, sin datos de contacto (teléfonos, correos, enlaces ni otras apps), sin identificar a personas y sin fotos de personas sin su consentimiento.
- Cada lugar lo revisa el equipo antes de publicarse y puede corregirlo. Las opiniones se publican al momento y las moderamos después.
- Sigues siendo autor de tus textos. Nos das permiso, no exclusivo y gratuito, para guardarlos y mostrarlos en Cruising mientras no los borres.

## Cómo te comportas

Respeta a los demás, el lugar y la ley del sitio donde estás. Nada de venta de sexo o drogas, acoso, amenazas, chantaje ni discriminación. Si algo es peligroso o ilegal, denúncialo. Puedes ver las normas completas en [Normas](/${locale}/cruising/rules).

## Moderación, denuncias y retirada

Puedes denunciar cualquier lugar u opinión. Una denuncia por un menor o por contenido ilegal oculta el contenido al momento hasta que lo revisemos. Cualquiera, aunque no tenga cuenta, puede pedir que retiremos un lugar en [cruising.codeqlick.com/${locale}/takedown](/${locale}/cruising/takedown); si se trata de un menor o de algo ilegal y da el enlace, lo ocultamos al momento, y siempre respondemos en 24 horas. Un lugar retirado por moderación no se puede volver a enviar. Si retiramos algo tuyo o suspendemos tu cuenta, te decimos el motivo por correo y puedes contestarnos para pedir que lo revisemos (Reglamento de Servicios Digitales).

## Lo que no garantizamos

Cruising es gratuito y se ofrece tal cual. La información la aportan los miembros: puede ser errónea, estar desactualizada o haber cambiado, y un lugar puede ser peligroso o estar vigilado. Ir a un lugar es decisión y responsabilidad tuya. No respondemos de lo que no dependa de nosotros, salvo en lo que la ley no permita excluir.

## Cambios y baja

Podemos cambiar estas condiciones; si es un cambio importante, te pediremos que las aceptes de nuevo al entrar. Puedes darte de baja cuando quieras borrando tu cuenta en «Mi cuenta»: se borran tu perfil, tus opiniones y tus denuncias, y los lugares que propusiste siguen publicados sin tu nombre.

## Ley aplicable

Estas condiciones se rigen por la legislación española. Para cualquier duda o queja, escríbenos a ${MAIL}.`;
  }
  return `## Who provides the service

Cruising (cruising.codeqlick.com) is a service of:

${ownerLines(owner, locale)}

## What it is

A directory of meeting places between men, with a map and reviews by adults. It is not a travel guide or a dating service: it only gathers what members contribute, which we review before publishing.

## Adults only (18+)

To propose a place, review one or report, you declare that you are at least 18 (and of legal age in your country, if higher). You can look at the map and the pages without an account, but this service is about adult sexuality: if you are not an adult, do not use it. We close any account we believe belongs to a minor.

## Your account

You need an account with a verified email, and to enter Cruising with your date of birth, the rules and your consent. You are responsible for what you do with it.

## What you contribute

- Places that exist and that you know, with true details: name, type, location, description and best times.
- **Never** near schools, playgrounds or places where children go. When in doubt, we reject it.
- Honest, respectful reviews, with no contact details (phone numbers, emails, links or other apps), without identifying people and without photos of people without their consent.
- The team reviews every place before it is published and may correct it. Reviews are published at once and we moderate them afterwards.
- You still own what you write. You give us a free, non-exclusive permission to store it and show it in Cruising until you delete it.

## How you behave

Respect others, the place and the law where you are. No selling sex or drugs, harassment, threats, blackmail or discrimination. If something is dangerous or illegal, report it. The full rules are in [Rules](/${locale}/cruising/rules).

## Moderation, reports and removal

You can report any place or review. A report for a minor or illegal content hides it at once until we review it. Anyone, even without an account, can ask us to remove a place at [cruising.codeqlick.com/${locale}/takedown](/${locale}/cruising/takedown); when it is about a minor or something illegal and they give the link, we hide it at once, and we always answer within 24 hours. A place removed by moderation can't be sent again. If we remove something of yours or suspend your account, we email you the reason and you can reply to ask us to review it (Digital Services Act).

## What we don't guarantee

Cruising is free and offered as is. The information comes from members: it can be wrong, out of date or changed, and a place can be dangerous or watched. Going somewhere is your decision and your responsibility. We are not liable for what is beyond our control, except where the law does not allow it to be excluded.

## Changes and leaving

We may change these terms; for an important change we will ask you to accept them again when you enter. You can leave whenever you like by deleting your account in "My account": your profile, reviews and reports are deleted, and the places you proposed stay published without your name.

## Governing law

These terms are governed by Spanish law. For any question or complaint, write to us at ${MAIL}.`;
}

function privacy(owner: LegalOwner, locale: AppLocale): string {
  if (locale === 'es') {
    return `## Responsable del tratamiento

${ownerLines(owner, locale)}

## Datos especialmente protegidos

Usar Cruising puede revelar aspectos de tu **vida sexual u orientación sexual**, datos de categoría especial (artículo 9 del RGPD). Solo los tratamos con tu **consentimiento explícito** (artículo 9.2.a), que das al marcar una casilla propia cuando entras en Cruising. Puedes retirarlo cuando quieras borrando tu cuenta. Mirar el mapa y las fichas sin cuenta no requiere ningún dato tuyo.

## Qué datos tratamos y para qué

- **Cuenta:** nombre, correo, contraseña (cifrada) e idioma, para darte acceso (artículo 6.1.b).
- **Edad:** compruebas tu fecha de nacimiento al entrar, pero **solo guardamos el año**.
- **Entrada:** la versión de las normas que aceptaste y cuándo, y si has activado los avisos por correo.
- **Lugares:** los que propones (nombre, tipo, ubicación, descripción, horas) con tu cuenta, para que puedas verlos y editarlos y para moderarlos.
- **Opiniones y denuncias:** las que escribes y las que haces.
- **Seguridad:** la dirección IP y el navegador de cada sesión (interés legítimo, artículo 6.1.f).
- **Tu posición:** si pulsas «Localizarme», el navegador centra el mapa en tu posición. **Esa posición nunca sale de tu dispositivo: no se envía ni se guarda.**

## Correos

Te escribimos cuando el equipo publica o rechaza un lugar tuyo, o suspende tu cuenta. Los correos nunca incluyen el nombre del lugar ni su contenido. Puedes desactivar el aviso de «lugar publicado» en tu perfil; las decisiones del equipo te las enviamos siempre.

## El mapa

Las imágenes del mapa las carga tu navegador directamente de los servidores de la **Fundación OpenStreetMap**, que reciben tu dirección IP y la zona que miras. Se rigen por su [política de privacidad](https://wiki.osmfoundation.org/wiki/Privacy_Policy). El mapa es © colaboradores de OpenStreetMap.

## Quién ve tus datos

Los lugares publicados los ve cualquiera, sin tu nombre. Las opiniones solo las ven los miembros que han entrado, como «Miembro». Tu nombre y tu correo nunca se muestran. No vendemos ni cedemos datos a nadie, salvo obligación legal (por ejemplo, ante una orden judicial o para denunciar contenido de menores). El único encargado del tratamiento es **OVHcloud**, que aloja el servicio, la base de datos y el correo en servidores de la Unión Europea.

## Cuánto tiempo los guardamos

Mientras tengas la cuenta. Al borrarla se borran tu perfil, tus opiniones y tus denuncias; los lugares que propusiste siguen publicados sin tu nombre. Las copias de seguridad se eliminan a los 14 días.

## Tus derechos

Puedes descargar tus datos y borrar tu cuenta desde «Mi cuenta». También puedes pedirnos acceder a tus datos, rectificarlos, suprimirlos, limitar u oponerte a su tratamiento o recibirlos en un formato portable escribiendo a ${MAIL}. Si crees que no los hemos tratado bien, puedes reclamar ante la Agencia Española de Protección de Datos ([aepd.es](https://www.aepd.es)).

## Cookies

Solo cookies técnicas: \`NEXT_LOCALE\` (idioma) y \`cq_at\` / \`cq_rt\` (sesión iniciada). Sin publicidad.`;
  }
  return `## Data controller

${ownerLines(owner, locale)}

## Specially protected data

Using Cruising can reveal aspects of your **sex life or sexual orientation**, special category data (article 9 of the GDPR). We only handle it with your **explicit consent** (article 9.2.a), which you give by ticking a separate box when you enter Cruising. You can withdraw it whenever you like by deleting your account. Looking at the map and the pages without an account needs no data from you.

## What data we handle and why

- **Account:** name, email, password (encrypted) and language, to give you access (article 6.1.b).
- **Age:** you give your date of birth when you enter, but **we only keep the year**.
- **Entry:** the version of the rules you accepted and when, and whether you turned on email alerts.
- **Places:** the ones you propose (name, type, location, description, times) with your account, so you can see and edit them and so we can moderate them.
- **Reviews and reports:** the ones you write and make.
- **Security:** the IP address and browser of each session (legitimate interest, article 6.1.f).
- **Your position:** if you press "Locate me", your browser centres the map on your position. **That position never leaves your device: it is not sent or stored.**

## Emails

We write to you when the team publishes or rejects a place of yours, or suspends your account. Emails never include the place's name or content. You can turn off the "place published" alert in your profile; the team's decisions are always sent.

## The map

The map's pictures are loaded by your browser directly from the servers of the **OpenStreetMap Foundation**, which receive your IP address and the area you are looking at. They are governed by their [privacy policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy). The map is © OpenStreetMap contributors.

## Who sees your data

Published places are seen by anyone, without your name. Reviews are seen only by members who have entered, as "Member". Your name and email are never shown. We don't sell or hand data to anyone, unless the law requires it (for example a court order, or to report content involving minors). The only data processor is **OVHcloud**, which hosts the service, the database and the email on servers in the European Union.

## How long we keep it

As long as you have the account. When you delete it, your profile, reviews and reports are deleted; the places you proposed stay published without your name. Backups are removed after 14 days.

## Your rights

You can download your data and delete your account from "My account". You can also ask us to access, correct or delete your data, to restrict or object to its processing, or to receive it in a portable format by writing to ${MAIL}. If you think we haven't handled it properly, you can complain to the Spanish Data Protection Agency ([aepd.es](https://www.aepd.es)).

## Cookies

Only technical cookies: \`NEXT_LOCALE\` (language) and \`cq_at\` / \`cq_rt\` (signed in). No advertising.`;
}

export function cruisingLegalDocument(
  page: CruisingLegalPage,
  owner: LegalOwner,
  locale: AppLocale,
): LegalDocument {
  const es = locale === 'es';
  return page === 'cruising-terms'
    ? {
        title: es ? 'Condiciones de uso de Cruising' : 'Cruising terms of use',
        description: es
          ? 'Quién puede usar Cruising, qué se puede aportar, cómo moderamos y cómo darte de baja.'
          : 'Who can use Cruising, what can be contributed, how we moderate and how to leave.',
        updated: UPDATED[locale],
        markdown: terms(owner, locale),
      }
    : {
        title: es ? 'Política de privacidad de Cruising' : 'Cruising privacy policy',
        description: es
          ? 'Qué datos trata Cruising, con qué base legal, cuánto tiempo y cómo ejercer tus derechos.'
          : 'What data Cruising handles, on what legal basis, for how long and how to use your rights.',
        updated: UPDATED[locale],
        markdown: privacy(owner, locale),
      };
}
