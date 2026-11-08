import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL } from '@/lib/site';
import { type LegalDocument, type LegalOwner, ownerLines } from './index';

/** Swipe's own terms of use and privacy policy (architecture 4.10). */
export type SwipeLegalPage = 'swipe-terms' | 'swipe-privacy';

const UPDATED = { es: '8 de noviembre de 2026', en: '8 November 2026' } as const;
const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

function terms(owner: LegalOwner, locale: AppLocale): string {
  if (locale === 'es') {
    return `## Quién presta el servicio

Swipe (swipe.codeqlick.com) es un servicio de:

${ownerLines(owner, locale)}

## Solo para mayores de 18 años

Swipe contiene desnudos y contenido sexual explícito. Para entrar declaras que tienes al menos 18 años (y la mayoría de edad de tu país, si es mayor) y que quieres ver este contenido. Si no es así, no entres. Cerramos cualquier cuenta que creamos de un menor y retiramos sus fotos.

## Tu cuenta

Necesitas una cuenta verificada por correo. Eres responsable de lo que hagas con ella. Antes de subir fotos nos envías una foto tuya con un papel con tu apodo, «Swipe» y la fecha; el equipo la revisa y solo la ve el equipo.

## Lo que subes

- Solo fotos **tuyas**, en las que apareces **solo tú**, tomadas por ti o con tu permiso, y solo si eres mayor de edad.
- Nada de terceros, menores, violencia, actos no consentidos, contenido ilegal, datos de contacto ni publicidad.
- Cada foto pasa por la revisión del equipo antes de publicarse, y la guardamos con tu apodo, su referencia y swipe.codeqlick.com como marca de agua.
- Sigues siendo dueño de tus fotos. Nos das permiso, no exclusivo y gratuito, para guardarlas, marcarlas y mostrarlas a otros miembros dentro de Swipe mientras no las borres. Puedes borrarlas cuando quieras.

## Cómo te comportas

Respeta a los demás: nada de acoso, amenazas, insistencia tras un «no», chantaje ni pedir dinero. No guardes, captures ni difundas las fotos de otros: es ilegal y supone el cierre de tu cuenta, además de las acciones legales que procedan. En el chat no se pueden compartir teléfonos, correos, enlaces ni otras apps hasta que cada uno haya enviado unos cuantos mensajes.

## Moderación, denuncias y retirada

Puedes denunciar cualquier foto o chat. Cualquiera, aunque no tenga cuenta, puede pedir que retiremos una foto en [swipe.codeqlick.com/${locale}/takedown](/${locale}/swipe/takedown); la ocultamos al momento si da su referencia y respondemos en 24 horas. Si retiramos algo tuyo o suspendemos tu cuenta, te decimos el motivo por correo y puedes contestarnos para pedir que lo revisemos (Reglamento de Servicios Digitales).

## Lo que no garantizamos

Swipe es gratuito y se ofrece tal cual. Hacemos lo posible por que funcione y por revisar todo lo que se publica, pero no podemos garantizar que nadie haga capturas de pantalla ni responder de lo que otros miembros hagan fuera de Swipe. No respondemos de lo que no dependa de nosotros, salvo en lo que la ley no permita excluir.

## Cambios y baja

Podemos cambiar estas condiciones; si es un cambio importante, te pediremos que las aceptes de nuevo al entrar. Puedes darte de baja cuando quieras borrando tu cuenta en «Mi cuenta»: se borra todo, también las fotos.

## Ley aplicable

Estas condiciones se rigen por la legislación española. Para cualquier duda o queja, escríbenos a ${MAIL}.`;
  }
  return `## Who provides the service

Swipe (swipe.codeqlick.com) is a service of:

${ownerLines(owner, locale)}

## Adults only (18+)

Swipe contains nudity and explicit sexual content. By entering you declare that you are at least 18 (and of legal age in your country, if higher) and want to see this content. If not, do not enter. We close any account we believe belongs to a minor and remove its photos.

## Your account

You need an account with a verified email. You are responsible for what you do with it. Before uploading photos you send us a photo of yourself holding a paper with your nickname, "Swipe" and the date; the team reviews it and only the team sees it.

## What you upload

- Only photos **of yourself**, where **only you** appear, taken by you or with your permission, and only if you are an adult.
- No third parties, minors, violence, non-consensual acts, illegal content, contact details or advertising.
- Every photo is reviewed by the team before it is published, and we store it with your nickname, its reference and swipe.codeqlick.com as a watermark.
- You still own your photos. You give us a free, non-exclusive permission to store, mark and show them to other members inside Swipe until you delete them. You can delete them whenever you like.

## How you behave

Respect others: no harassment, threats, pushing after a "no", blackmail or asking for money. Do not save, capture or share other people's photos: it is illegal and gets your account closed, besides any legal action. In the chat, phone numbers, emails, links and other apps can't be shared until each of you has sent a few messages.

## Moderation, reports and removal

You can report any photo or chat. Anyone, even without an account, can ask us to remove a photo at [swipe.codeqlick.com/${locale}/takedown](/${locale}/swipe/takedown); we hide it at once when they give its reference and answer within 24 hours. If we remove something of yours or suspend your account, we email you the reason and you can reply to ask us to review it (Digital Services Act).

## What we don't guarantee

Swipe is free and offered as is. We do our best to keep it working and to review everything published, but we can't guarantee that nobody takes screenshots, nor answer for what other members do outside Swipe. We are not liable for what is beyond our control, except where the law does not allow it to be excluded.

## Changes and leaving

We may change these terms; for an important change we will ask you to accept them again when you enter. You can leave whenever you like by deleting your account in "My account": everything is deleted, photos included.

## Governing law

These terms are governed by Spanish law. For any question or complaint, write to us at ${MAIL}.`;
}

function privacy(owner: LegalOwner, locale: AppLocale): string {
  if (locale === 'es') {
    return `## Responsable del tratamiento

${ownerLines(owner, locale)}

## Datos especialmente protegidos

Las fotos íntimas y lo que indicas sobre a quién quieres ver revelan aspectos de tu **vida sexual u orientación sexual**, datos de categoría especial (artículo 9 del RGPD). Solo los tratamos con tu **consentimiento explícito** (artículo 9.2.a), que das al marcar la casilla de consentimiento al subir cada foto y al rellenar tu perfil. Puedes retirarlo cuando quieras borrando la foto, el dato o tu cuenta.

## Qué datos tratamos y para qué

- **Cuenta:** nombre, correo, contraseña (cifrada) e idioma, para darte acceso (artículo 6.1.b).
- **Edad:** compruebas tu fecha de nacimiento al entrar, pero **solo guardamos el año**, para el filtro de edad.
- **Perfil:** apodo, género, a quién quieres ver, intereses, una frase, país (opcional) y tus filtros y preferencias.
- **Foto de verificación:** solo para comprobar que eres tú y que eres adulto; solo la ve el equipo.
- **Fotos:** las guardamos sin metadatos (sin datos de la cámara ni ubicación), con una marca de agua, y una huella para impedir que una foto retirada se vuelva a subir.
- **Actividad:** los «me gusta» y «me encanta», los matches, los mensajes, las denuncias y las solicitudes de retirada.
- **Avisos:** si los activas, la suscripción de tu dispositivo para las notificaciones.
- **Seguridad:** la dirección IP y el navegador de cada sesión (interés legítimo, artículo 6.1.f).

## Correos y notificaciones

Te escribimos cuando el equipo revisa tu verificación o una foto, cuando tienes un match, un «me encanta» o mensajes sin leer. Los correos nunca incluyen fotos, apodos ni mensajes. Puedes desactivar los de matches, «me encanta» y mensajes en tu perfil; las decisiones del equipo te las enviamos siempre.

## Quién ve tus datos

Tus fotos publicadas las ven otros miembros adultos de Swipe, con tu apodo, género, intereses y frase; nunca tu nombre ni tu correo. Las pendientes y la verificación solo las ve el equipo. No vendemos ni cedemos datos a nadie, salvo obligación legal (por ejemplo, ante una orden judicial o para denunciar contenido de menores). El único encargado del tratamiento es **OVHcloud**, que aloja el servicio, la base de datos y el correo en servidores de la Unión Europea.

## Cuánto tiempo los guardamos

Mientras tengas la cuenta. Las fotos que borras y las rechazadas se eliminan del servidor en menos de 6 horas; la verificación rechazada, al momento. Al terminar un match se borra su chat. Al borrar tu cuenta se borra todo (los archivos, en menos de 6 horas), salvo la huella de las fotos retiradas por infringir las normas, que guardamos para que no vuelvan a subirse. Las copias de seguridad se eliminan a los 14 días.

## Tus derechos

Puedes descargar tus datos y borrar tu cuenta desde «Mi cuenta». También puedes pedirnos acceder a tus datos, rectificarlos, suprimirlos, limitar u oponerte a su tratamiento o recibirlos en un formato portable escribiendo a ${MAIL}. Si crees que no los hemos tratado bien, puedes reclamar ante la Agencia Española de Protección de Datos ([aepd.es](https://www.aepd.es)).

## Cookies

Solo cookies técnicas: \`NEXT_LOCALE\` (idioma) y \`cq_at\` / \`cq_rt\` (sesión iniciada). Sin publicidad ni análisis.`;
  }
  return `## Data controller

${ownerLines(owner, locale)}

## Specially protected data

Intimate photos and what you say about whom you want to see reveal your **sex life or sexual orientation**, special category data (article 9 GDPR). We only process them with your **explicit consent** (article 9.2.a), which you give by ticking the consent box when uploading each photo and by filling in your profile. You can withdraw it at any time by deleting the photo, the detail or your account.

## What data we process and why

- **Account:** name, email, password (hashed) and language, to give you access (article 6.1.b).
- **Age:** you confirm your date of birth when you enter, but **we only keep the year**, for the age filter.
- **Profile:** nickname, gender, whom you want to see, interests, a sentence, country (optional) and your filters and preferences.
- **Verification photo:** only to check that it is you and that you are an adult; only the team sees it.
- **Photos:** stored without metadata (no camera data or location), with a watermark, and a fingerprint so a removed photo can't be uploaded again.
- **Activity:** likes and «me encanta», matches, messages, reports and removal requests.
- **Notifications:** if you turn them on, your device's subscription.
- **Security:** the IP address and browser of each session (legitimate interest, article 6.1.f).

## Emails and notifications

We write when the team reviews your verification or a photo, and when you have a match, a «me encanta» or unread messages. Emails never include photos, nicknames or messages. You can turn off the match, «me encanta» and message emails in your profile; the team's decisions are always sent.

## Who sees your data

Your published photos are seen by other adult Swipe members, with your nickname, gender, interests and sentence; never your name or email. Pending photos and the verification are only seen by the team. We don't sell or hand over data to anyone, unless the law requires it (for example, a court order or reporting content involving minors). The only data processor is **OVHcloud**, which hosts the service, the database and the email on servers in the European Union.

## How long we keep it

While you have the account. Photos you delete and rejected ones are erased from the server within 6 hours; a rejected verification, at once. Ending a match deletes its chat. Deleting your account deletes everything (files within 6 hours), except the fingerprint of photos removed for breaking the rules, kept so they can't be uploaded again. Backups are deleted after 14 days.

## Your rights

You can download your data and delete your account from "My account". You can also ask to access, correct or delete your data, restrict or object to its processing, or receive it in a portable format by writing to ${MAIL}. If you think we have mishandled it, you can complain to the Spanish Data Protection Agency ([aepd.es](https://www.aepd.es)).

## Cookies

Technical cookies only: \`NEXT_LOCALE\` (language) and \`cq_at\` / \`cq_rt\` (signed in). No advertising or analytics.`;
}

export function swipeLegalDocument(
  page: SwipeLegalPage,
  owner: LegalOwner,
  locale: AppLocale,
): LegalDocument {
  const es = locale === 'es';
  return page === 'swipe-terms'
    ? {
        title: es ? 'Condiciones de uso de Swipe' : 'Swipe terms of use',
        description: es
          ? 'Quién puede usar Swipe, qué se puede subir, cómo moderamos y cómo darte de baja.'
          : 'Who can use Swipe, what can be uploaded, how we moderate and how to leave.',
        updated: UPDATED[locale],
        markdown: terms(owner, locale),
      }
    : {
        title: es ? 'Política de privacidad de Swipe' : 'Swipe privacy policy',
        description: es
          ? 'Qué datos trata Swipe, con qué base legal, cuánto tiempo y cómo ejercer tus derechos.'
          : 'What data Swipe handles, on what legal basis, for how long and how to use your rights.',
        updated: UPDATED[locale],
        markdown: privacy(owner, locale),
      };
}
