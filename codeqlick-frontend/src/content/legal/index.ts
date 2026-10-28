import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL } from '@/lib/site';

/** Who is responsible for the site (from the server's environment; see lib/env.ts). */
export type LegalOwner = {
  name: string;
  /** DNI/NIF, when they choose to publish it. */
  taxId?: string;
  address?: string;
};

export type LegalDocument = { title: string; updated: string; markdown: string };
export type LegalPage = 'legal' | 'privacy' | 'terms';

const UPDATED = { es: '15 de octubre de 2026', en: '15 October 2026' } as const;

function ownerLines(owner: LegalOwner, locale: AppLocale): string {
  const es = locale === 'es';
  const lines = [`- **${es ? 'Titular' : 'Owner'}:** ${owner.name}`];
  if (owner.taxId) lines.push(`- **${es ? 'NIF' : 'Tax ID'}:** ${owner.taxId}`);
  if (owner.address) lines.push(`- **${es ? 'Dirección' : 'Address'}:** ${owner.address}`);
  lines.push(
    `- **${es ? 'Correo electrónico' : 'Email'}:** [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`,
  );
  lines.push(`- **${es ? 'Sitio web' : 'Website'}:** codeqlick.com`);
  return lines.join('\n');
}

function legalNotice(owner: LegalOwner, locale: AppLocale): string {
  if (locale === 'es') {
    return `## Datos del titular

En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), estos son los datos del responsable de este sitio web:

${ownerLines(owner, locale)}

Codeqlick es el nombre con el que su titular presenta su trabajo de diseño y desarrollo de software. No es una sociedad mercantil.

## Objeto

Este sitio informa sobre los servicios de Codeqlick, publica artículos y casos de éxito, permite ponerse en contacto mediante un formulario y ofrece a los clientes un área privada para seguir sus proyectos.

## Condiciones de uso

Al navegar por el sitio aceptas usarlo de buena fe y de acuerdo con la ley. No está permitido intentar acceder a áreas privadas sin autorización, alterar su funcionamiento ni usar sus contenidos con fines ilícitos.

## Propiedad intelectual

Los textos, el diseño, el logotipo y el código de este sitio pertenecen a su titular o se usan con licencia. Puedes citar o enlazar los contenidos indicando su origen; para cualquier otro uso, escríbenos antes. Los nombres y marcas de clientes y de terceros pertenecen a sus respectivos propietarios.

## Responsabilidad

Cuidamos que la información publicada sea correcta y esté al día, pero no podemos garantizar que no contenga errores. El sitio puede enlazar a páginas de terceros, sobre cuyos contenidos no tenemos control ni responsabilidad.

## Legislación aplicable

Estas condiciones se rigen por la legislación española. Si tienes cualquier duda, escríbenos a [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`;
  }
  return `## Owner

As required by article 10 of Spanish Law 34/2002 on information society services and e-commerce (LSSI-CE), these are the details of the person responsible for this website:

${ownerLines(owner, locale)}

Codeqlick is the name under which its owner presents their software design and development work. It is not a company.

## Purpose

This site describes Codeqlick's services, publishes articles and case studies, lets visitors get in touch through a form and gives clients a private area to follow their projects.

## Terms of use

By browsing the site you agree to use it in good faith and lawfully. You may not try to reach private areas without authorization, disrupt how it works or use its content for unlawful purposes.

## Intellectual property

The texts, design, logo and code of this site belong to its owner or are used under licence. You may quote or link to the content as long as you name the source; for any other use, please write to us first. Client and third-party names and trademarks belong to their respective owners.

## Liability

We take care that the information published is correct and up to date, but we can't guarantee it is free of errors. The site may link to third-party pages, whose content we neither control nor answer for.

## Governing law

These terms are governed by Spanish law. If you have any questions, write to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`;
}

function privacyPolicy(owner: LegalOwner, locale: AppLocale): string {
  if (locale === 'es') {
    return `## Responsable del tratamiento

${ownerLines(owner, locale)}

## Qué datos tratamos y para qué

**Formulario de contacto.** Tu nombre, tu correo electrónico y, si los indicas, tu empresa, el tipo de proyecto que necesitas y tu mensaje, además del idioma en que nos escribes. Los usamos para responderte y, si te interesa, preparar una propuesta. La base legal es tu solicitud y la aplicación de medidas precontractuales (artículo 6.1.b del RGPD).

**Área de clientes.** Si eres cliente, tu nombre, tu correo electrónico, tu contraseña (guardada cifrada, nunca en claro), el idioma en que prefieres los correos, los comentarios y aprobaciones que dejas en tus proyectos y, por seguridad, la dirección IP y el navegador de cada sesión iniciada. Los usamos para darte acceso y prestarte el servicio contratado (artículo 6.1.b del RGPD) y para proteger tu cuenta (interés legítimo, artículo 6.1.f).

**Correos.** Te escribimos para responderte, para avisarte de novedades en tus proyectos o para restablecer tu contraseña. No enviamos publicidad ni boletines.

**Estadísticas de visitas.** Medimos las visitas con Umami, una herramienta instalada en nuestro propio servidor que no usa cookies ni guarda datos que te identifiquen: solo cuenta páginas vistas, de dónde llegan las visitas, el país, el tipo de dispositivo y el navegador, de forma agregada. Si tu navegador tiene activada la opción «No rastrear», no se registra nada.

## Cuánto tiempo los guardamos

Los mensajes del formulario, mientras sean necesarios para atender tu solicitud o hasta que nos pidas que los borremos. Los datos de clientes, mientras dure la relación y, después, durante los plazos que exija la ley. Las copias de seguridad se eliminan automáticamente a los 14 días.

## Con quién los compartimos

Con nadie, salvo obligación legal. El sitio, la base de datos y el correo están alojados en servidores de OVHcloud en la Unión Europea, que actúa como encargado del tratamiento. No hacemos transferencias internacionales de datos.

## Tus derechos

Puedes pedirnos acceder a tus datos, rectificarlos, suprimirlos, limitar su tratamiento, oponerte a él o recibirlos en un formato portable escribiendo a [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos ([aepd.es](https://www.aepd.es)).

## Cookies

Este sitio solo usa cookies técnicas, necesarias para que funcione, por lo que no pide consentimiento:

- \`NEXT_LOCALE\`: recuerda el idioma que has elegido.
- \`cq_at\` y \`cq_rt\`: mantienen tu sesión iniciada en el área de clientes o de administración; solo existen si inicias sesión.

No usamos cookies de publicidad ni de análisis.`;
  }
  return `## Data controller

${ownerLines(owner, locale)}

## What data we process and why

**Contact form.** Your name, your email address and, if you give them, your company, the kind of project you need and your message, plus the language you write in. We use them to answer you and, if you are interested, to prepare a proposal. The legal basis is your request and steps taken before a contract (article 6.1.b GDPR).

**Client area.** If you are a client: your name, your email address, your password (stored hashed, never in plain text), the language you prefer for emails, the comments and approvals you leave on your projects and, for security, the IP address and browser of each session. We use them to give you access and provide the contracted service (article 6.1.b GDPR) and to protect your account (legitimate interest, article 6.1.f).

**Emails.** We write to answer you, to let you know about updates on your projects or to reset your password. We send no advertising or newsletters.

**Visit statistics.** We measure visits with Umami, a tool running on our own server that uses no cookies and stores nothing that identifies you: it only counts page views, where visits come from, the country, the type of device and the browser, in aggregate. If your browser has "Do Not Track" on, nothing is recorded.

## How long we keep it

Contact form messages, for as long as needed to handle your request or until you ask us to delete them. Client data, for as long as we work together and afterwards for the periods the law requires. Backups are deleted automatically after 14 days.

## Who we share it with

No one, unless the law requires it. The site, the database and the email are hosted on OVHcloud servers in the European Union, which acts as data processor. We make no international data transfers.

## Your rights

You can ask to access, correct or delete your data, restrict or object to its processing, or receive it in a portable format by writing to [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). If you think we have mishandled your data, you can complain to the Spanish Data Protection Agency ([aepd.es](https://www.aepd.es)).

## Cookies

This site only uses technical cookies it needs to work, so it doesn't ask for consent:

- \`NEXT_LOCALE\`: remembers the language you chose.
- \`cq_at\` and \`cq_rt\`: keep you signed in to the client or admin area; they only exist if you sign in.

We use no advertising or analytics cookies.`;
}

/**
 * Terms of sale of a basic website bought online (architecture 8.2, decision 20). A draft for a
 * gestor to review before buying online is switched on.
 */
function termsOfSale(owner: LegalOwner, locale: AppLocale): string {
  if (locale === 'es') {
    return `Estas condiciones se aplican cuando compras en codeqlick.com la web básica de tu negocio a partir de su vista previa.

## Quién te la vende

${ownerLines(owner, locale)}

## Qué compras

- La web de tu negocio tal como la ves en la vista previa, creada y publicada en cuanto se confirma el pago, primero en una dirección de Codeqlick (\`<nombre>.demo.codeqlick.com\`) y en tu dominio cuando lo conectes.
- Su formulario de contacto, que te envía por email los mensajes de tus visitas.
- El acceso a tu área de cliente, desde donde puedes cambiar todo el contenido de la web (textos, fotos, colores, tipografías, secciones y datos legales) y elegir tu dominio.
- El alojamiento de la web con HTTPS y unas estadísticas de visitas sin cookies.

No incluye el dominio: lo registras y pagas tú a la empresa que elijas y es tuyo. Tampoco incluye el correo de tu dominio, que contratas con quien lo registres.

## Precio y pago

El precio es el que se muestra antes de pagar, un único pago. El pago se hace con tarjeta en Stripe, que te envía el recibo; nosotros no vemos ni guardamos los datos de tu tarjeta.

## Entrega

La web se crea y se publica al momento, en cuanto Stripe confirma el pago. Te enviamos un email para entrar en tu área de cliente. Si algo fallara al crearla, te escribimos y la terminamos nosotros sin coste.

## Derecho de desistimiento

Al pagar pides expresamente que creemos la web en ese momento. Según el artículo 103 del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, una vez creada y entregada pierdes el derecho de desistimiento. Si pagas y la web todavía no se ha podido crear, puedes pedirnos la devolución completa.

## Tu contenido

Los textos, fotos y datos que pongas en tu web son responsabilidad tuya: deben ser tuyos o tener permiso para usarlos, y ser veraces, sobre todo los datos legales del negocio. Podemos retirar una web que se use para algo ilícito.

## Alojamiento y soporte

Mantenemos la web en línea y corregimos sin coste los fallos de la plantilla. Si algún día dejáramos de ofrecer el alojamiento, te avisaríamos con al menos tres meses de antelación y te daríamos una copia de tu web para llevarla a otro sitio.

## Legislación aplicable

Estas condiciones se rigen por la legislación española. Si tienes cualquier duda o reclamación, escríbenos a [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). También puedes acudir a la plataforma europea de resolución de litigios en línea: [ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr).`;
  }
  return `These terms apply when you buy your business's basic website from its preview on codeqlick.com.

## Who sells it

${ownerLines(owner, locale)}

## What you buy

- Your business's website as you see it in the preview, made and published as soon as the payment is confirmed, first at a Codeqlick address (\`<name>.demo.codeqlick.com\`) and on your domain once you connect it.
- Its contact form, which emails you your visitors' messages.
- Access to your client area, where you can change all of the website's content (texts, photos, colours, fonts, sections and legal data) and choose your domain.
- Hosting of the website with HTTPS and cookieless visit statistics.

The domain isn't included: you register and pay it to the company you choose, and it is yours. Nor is your domain's email, which you get from whoever registers it.

## Price and payment

The price is the one shown before paying, one payment. You pay by card on Stripe, which sends you the receipt; we never see or keep your card details.

## Delivery

The website is made and published at once, as soon as Stripe confirms the payment. We email you how to enter your client area. If anything failed while making it, we write to you and finish it ourselves at no cost.

## Right of withdrawal

By paying you expressly ask us to make the website right away. Under article 103 of the Spanish consumer protection law (texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios), once it is made and delivered you lose the right of withdrawal. If you pay and the website couldn't be made yet, you can ask us for a full refund.

## Your content

The texts, photos and data you put on your website are your responsibility: they must be yours or used with permission, and true, above all the business's legal data. We may take down a website used for anything unlawful.

## Hosting and support

We keep the website online and fix the template's faults at no cost. If we ever stopped offering hosting, we would tell you at least three months before and give you a copy of your website to take elsewhere.

## Governing law

These terms are governed by Spanish law. For any question or complaint, write to us at [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). You can also use the European online dispute resolution platform: [ec.europa.eu/consumers/odr](https://ec.europa.eu/consumers/odr).`;
}

export function legalDocument(
  page: LegalPage,
  owner: LegalOwner,
  locale: AppLocale,
): LegalDocument {
  const es = locale === 'es';
  if (page === 'terms') {
    return {
      title: es ? 'Condiciones de contratación' : 'Terms of sale',
      updated: UPDATED[locale],
      markdown: termsOfSale(owner, locale),
    };
  }
  return page === 'legal'
    ? {
        title: es ? 'Aviso legal' : 'Legal notice',
        updated: UPDATED[locale],
        markdown: legalNotice(owner, locale),
      }
    : {
        title: es ? 'Política de privacidad' : 'Privacy policy',
        updated: UPDATED[locale],
        markdown: privacyPolicy(owner, locale),
      };
}
