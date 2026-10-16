import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** To a person of the client account, in their language: how did it go? */
export function reviewRequestEmail(
  person: { name: string; email: string },
  project: { name: string },
  link: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: person.email,
    subject: es
      ? `${project.name} ya está en marcha: ¿qué tal ha ido?`
      : `${project.name} is live: how did it go?`,
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Dos minutos para contarnos tu experiencia.'
          : 'Two minutes to tell us about your experience.',
        title: es ? '¿Qué tal ha ido?' : 'How did it go?',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: [
          es
            ? `${project.name} ya está publicado. Gracias por confiar en nosotros. ¿Nos cuentas en dos minutos qué tal ha ido? Tu opinión nos ayuda a mejorar y, si nos das permiso, a que otras empresas nos conozcan.`
            : `${project.name} is live. Thank you for trusting us. Could you take two minutes to tell us how it went? Your opinion helps us improve and, with your permission, helps other businesses find us.`,
        ],
        button: { label: es ? 'Dejar mi valoración' : 'Leave my review', url: link },
      },
      siteUrl,
    ),
  };
}

/** To the team (English): a review came in. */
export function reviewSubmittedEmail(
  to: string,
  person: { name: string; email: string },
  project: { name: string },
  review: { rating: number; quote: string; consent: boolean },
  link: string,
  siteUrl: string,
): MailMessage {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  return {
    to,
    replyTo: person.email,
    subject: `${project.name}: review ${review.rating}/5`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: `${person.name} rated ${project.name} ${review.rating}/5.`,
        title: 'A client review came in',
        intro: [
          `${person.name} rated ${project.name} ${stars} (${review.rating}/5) and ${review.consent ? 'allows' : 'does not allow'} it on the website.`,
        ],
        quote: { body: review.quote },
        button: { label: review.consent ? 'Review and publish' : 'Read it', url: link },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
