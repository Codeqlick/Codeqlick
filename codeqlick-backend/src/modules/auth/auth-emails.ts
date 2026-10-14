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
