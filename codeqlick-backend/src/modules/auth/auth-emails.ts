import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** "Forgot my password" email with the reset link, in the language the request came from. */
export function passwordResetEmail(
  user: { name: string; email: string },
  link: string,
  locale: ApiLocale,
  ttlMinutes: number,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: user.email,
    subject: es ? 'Restablece tu contraseña — Codeqlick' : 'Reset your password — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `El enlace para elegir una contraseña nueva caduca en ${ttlMinutes} minutos.`
          : `The link to choose a new password expires in ${ttlMinutes} minutes.`,
        title: es ? 'Restablece tu contraseña' : 'Reset your password',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [
          es
            ? 'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Codeqlick. Abre este enlace para elegir una nueva:'
            : 'We received a request to reset the password of your Codeqlick account. Open this link to choose a new one:',
        ],
        button: { label: es ? 'Elegir contraseña nueva' : 'Choose a new password', url: link },
        note: es
          ? `El enlace caduca en ${ttlMinutes} minutos y solo se puede usar una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.`
          : `The link expires in ${ttlMinutes} minutes and can only be used once. If you didn't ask for it, ignore this email: your password stays the same.`,
      },
      siteUrl,
    ),
  };
}

/** Welcome email for an account an admin created, with the link to choose its password. */
export function invitationEmail(
  user: { name: string; email: string },
  link: string,
  locale: ApiLocale,
  ttlDays: number,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: user.email,
    subject: es
      ? 'Bienvenido a Codeqlick — crea tu contraseña'
      : 'Welcome to Codeqlick — choose your password',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Tu cuenta está lista: elige tu contraseña para entrar.'
          : 'Your account is ready: choose your password to sign in.',
        title: es ? 'Bienvenido a Codeqlick' : 'Welcome to Codeqlick',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [
          es
            ? 'Te hemos creado una cuenta en Codeqlick. Desde ella podrás seguir tus proyectos, sus novedades y sus archivos.'
            : "We've created a Codeqlick account for you. With it you can follow your projects, their updates and their files.",
          es
            ? 'Abre este enlace para elegir tu contraseña:'
            : 'Open this link to choose your password:',
        ],
        button: { label: es ? 'Crear mi contraseña' : 'Choose my password', url: link },
        note: es
          ? `El enlace caduca en ${ttlDays} días y solo se puede usar una vez. Después entrarás con este correo (${user.email}) y la contraseña que elijas.`
          : `The link expires in ${ttlDays} days and can only be used once. After that, sign in with this email (${user.email}) and the password you chose.`,
      },
      siteUrl,
    ),
  };
}
