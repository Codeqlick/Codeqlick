import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** "Confirm your subscription": the double opt-in link (no unsubscribe headers: it is no newsletter). */
export function newsletterConfirmEmail(
  to: string,
  locale: ApiLocale,
  link: string,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to,
    subject: es ? 'Confirma tu suscripción — Codeqlick' : 'Confirm your subscription — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Abre el enlace para recibir las novedades del blog por correo.'
          : 'Open the link to get new blog posts by email.',
        title: es ? 'Confirma tu suscripción' : 'Confirm your subscription',
        intro: [
          es
            ? 'Alguien (esperamos que tú) ha pedido recibir por correo los nuevos artículos del blog de Codeqlick. Confirma tu correo para empezar a recibirlos:'
            : 'Someone (we hope you) asked to get new posts from the Codeqlick blog by email. Confirm your address to start receiving them:',
        ],
        button: { label: es ? 'Confirmar suscripción' : 'Confirm subscription', url: link },
        note: es
          ? 'El enlace caduca en 48 horas. Si no lo has pedido tú, ignora este correo y no recibirás nada.'
          : "The link expires in 48 hours. If you didn't ask for it, ignore this email and you won't receive anything.",
      },
      siteUrl,
    ),
  };
}

export interface NewsletterPostEmail {
  title: string;
  excerpt: string;
  /** SITE_URL/{locale}/blog/{slug} */
  postUrl: string;
}

/** A new post, for one subscriber: with the one-click unsubscribe headers (RFC 8058). */
export function newsletterPostEmail(
  to: string,
  locale: ApiLocale,
  post: NewsletterPostEmail,
  unsubscribe: { pageUrl: string; oneClickUrl: string },
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  const rendered = renderEmail(
    {
      locale,
      preheader: post.excerpt.slice(0, 120),
      title: post.title,
      intro: [post.excerpt],
      button: { label: es ? 'Leer el artículo' : 'Read the post', url: post.postUrl },
      note: es
        ? `Recibes este correo porque te suscribiste al blog de Codeqlick. Si ya no quieres recibirlo, puedes darte de baja aquí: ${unsubscribe.pageUrl}`
        : `You get this email because you subscribed to the Codeqlick blog. If you no longer want it, you can unsubscribe here: ${unsubscribe.pageUrl}`,
    },
    siteUrl,
  );
  return {
    to,
    subject: post.title,
    ...rendered,
    headers: {
      'List-Unsubscribe': `<${unsubscribe.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
