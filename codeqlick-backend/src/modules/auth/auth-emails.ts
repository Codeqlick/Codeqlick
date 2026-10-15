import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { MailMessage } from '../mail/mail.service.js';

/** "Forgot my password" email with the reset link, in the language the request came from. */
export function passwordResetEmail(
  user: { name: string; email: string },
  link: string,
  locale: ApiLocale,
  ttlMinutes: number,
): MailMessage {
  if (locale === 'es') {
    return {
      to: user.email,
      subject: 'Restablece tu contraseña — Codeqlick',
      text: [
        `Hola ${user.name}:`,
        '',
        'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Codeqlick. Abre este enlace para elegir una nueva:',
        '',
        link,
        '',
        `El enlace caduca en ${ttlMinutes} minutos y solo se puede usar una vez.`,
        'Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.',
        '',
        'Un saludo,',
        'El equipo de Codeqlick',
      ].join('\n'),
    };
  }
  return {
    to: user.email,
    subject: 'Reset your password — Codeqlick',
    text: [
      `Hi ${user.name},`,
      '',
      'We received a request to reset the password of your Codeqlick account. Open this link to choose a new one:',
      '',
      link,
      '',
      `The link expires in ${ttlMinutes} minutes and can only be used once.`,
      "If you didn't ask for it, ignore this email: your password stays the same.",
      '',
      'Best regards,',
      'The Codeqlick team',
    ].join('\n'),
  };
}

/** Welcome email for an account an admin created, with the link to choose its password. */
export function invitationEmail(
  user: { name: string; email: string },
  link: string,
  locale: ApiLocale,
  ttlDays: number,
): MailMessage {
  if (locale === 'es') {
    return {
      to: user.email,
      subject: 'Bienvenido a Codeqlick — crea tu contraseña',
      text: [
        `Hola ${user.name}:`,
        '',
        'Te hemos creado una cuenta en Codeqlick. Desde ella podrás seguir tus proyectos, sus novedades y sus archivos.',
        '',
        'Abre este enlace para elegir tu contraseña:',
        '',
        link,
        '',
        `El enlace caduca en ${ttlDays} días y solo se puede usar una vez. Después entrarás con este correo (${user.email}) y la contraseña que elijas.`,
        '',
        'Un saludo,',
        'El equipo de Codeqlick',
      ].join('\n'),
    };
  }
  return {
    to: user.email,
    subject: 'Welcome to Codeqlick — choose your password',
    text: [
      `Hi ${user.name},`,
      '',
      "We've created a Codeqlick account for you. With it you can follow your projects, their updates and their files.",
      '',
      'Open this link to choose your password:',
      '',
      link,
      '',
      `The link expires in ${ttlDays} days and can only be used once. After that, sign in with this email (${user.email}) and the password you chose.`,
      '',
      'Best regards,',
      'The Codeqlick team',
    ].join('\n'),
  };
}
