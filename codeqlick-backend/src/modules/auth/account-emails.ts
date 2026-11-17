import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** To the new address: the link that confirms it as the account's email. */
export function emailChangeConfirmEmail(
  user: { name: string; email: string },
  newEmail: string,
  link: string,
  locale: ApiLocale,
  ttlHours: number,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: newEmail,
    subject: es ? 'Confirma tu nuevo correo — Codeqlick' : 'Confirm your new email — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Abre el enlace para usar este correo en tu cuenta de Codeqlick.'
          : 'Open the link to use this email for your Codeqlick account.',
        title: es ? 'Confirma tu nuevo correo' : 'Confirm your new email',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [
          es
            ? `Has pedido que tu cuenta de Codeqlick use este correo en lugar de ${user.email}. Abre este enlace para confirmarlo:`
            : `You asked for your Codeqlick account to use this email instead of ${user.email}. Open this link to confirm it:`,
        ],
        button: { label: es ? 'Confirmar este correo' : 'Confirm this email', url: link },
        note: es
          ? `El enlace caduca en ${ttlHours} horas. Hasta que lo abras, tu cuenta sigue con ${user.email}. Si no lo has pedido tú, ignora este correo.`
          : `The link expires in ${ttlHours} hours. Until you open it, your account keeps ${user.email}. If you didn't ask for it, ignore this email.`,
      },
      siteUrl,
    ),
  };
}

/** To the old address once the change is done, so an unexpected change doesn't go unnoticed. */
export function emailChangedNoticeEmail(
  user: { name: string },
  oldEmail: string,
  newEmail: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: oldEmail,
    subject: es
      ? 'El correo de tu cuenta ha cambiado — Codeqlick'
      : 'Your account email has changed — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Tu cuenta de Codeqlick ahora usa ${newEmail}.`
          : `Your Codeqlick account now uses ${newEmail}.`,
        title: es ? 'Tu correo ha cambiado' : 'Your email has changed',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [
          es
            ? `Tu cuenta de Codeqlick ya no usa ${oldEmail}: desde ahora entras con ${newEmail}, y ahí te llegarán nuestros correos.`
            : `Your Codeqlick account no longer uses ${oldEmail}: from now on you sign in with ${newEmail}, and our emails go there.`,
        ],
        note: es
          ? 'Si no has sido tú, responde a este correo cuanto antes y lo revisamos.'
          : "If this wasn't you, reply to this email as soon as possible and we'll look into it.",
      },
      siteUrl,
    ),
  };
}

/** After the person deleted their own account. */
export function accountDeletedEmail(
  user: { name: string; email: string },
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: user.email,
    subject: es
      ? 'Tu cuenta se ha eliminado — Codeqlick'
      : 'Your account has been deleted — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Hemos borrado tu cuenta de Codeqlick y sus datos.'
          : 'We have deleted your Codeqlick account and its data.',
        title: es ? 'Cuenta eliminada' : 'Account deleted',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [
          es
            ? 'Como pediste, hemos eliminado tu cuenta de Codeqlick y los datos que guardábamos de ella. Ya no puedes entrar con este correo.'
            : 'As you asked, we have deleted your Codeqlick account and the data we kept for it. You can no longer sign in with this email.',
          es
            ? 'Si algún día quieres volver, puedes crear una cuenta nueva cuando quieras.'
            : 'If you ever want to come back, you can create a new account at any time.',
        ],
        note: es
          ? 'Si no lo has pedido tú, responde a este correo.'
          : "If you didn't ask for this, reply to this email.",
      },
      siteUrl,
    ),
  };
}
