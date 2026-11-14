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

/** Why the team invites someone to create their account: said in the invitation. */
export type SignupReason = 'project' | 'proposal' | 'account';

/**
 * The team's invitation to create an account it prepared for an email (decision 17): the link
 * opens the sign-up form with the email fixed, and proves it.
 */
export function signupInvitationEmail(
  user: { name: string; email: string },
  link: string,
  locale: ApiLocale,
  ttlDays: number,
  reason: SignupReason,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  const why = {
    project: es
      ? 'Hemos abierto tu proyecto en Codeqlick. Crea tu cuenta para seguirlo: sus novedades, sus archivos y, si es una web, editarla tú mismo.'
      : "We've opened your project at Codeqlick. Create your account to follow it: its updates, its files and, for a website, editing it yourself.",
    proposal: es
      ? 'Te hemos preparado una propuesta en Codeqlick. Crea tu cuenta para verla y aceptarla.'
      : "We've prepared a proposal for you at Codeqlick. Create your account to read and accept it.",
    account: es
      ? 'Te invitamos a crear tu cuenta en Codeqlick, desde la que podrás seguir tus proyectos y propuestas.'
      : "You're invited to create your Codeqlick account, where you can follow your projects and proposals.",
  }[reason];
  return {
    to: user.email,
    subject: es ? 'Crea tu cuenta en Codeqlick' : 'Create your Codeqlick account',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Elige tu contraseña y entra a tu área de cliente.'
          : 'Choose your password and enter your client area.',
        title: es ? 'Crea tu cuenta' : 'Create your account',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [why],
        button: { label: es ? 'Crear mi cuenta' : 'Create my account', url: link },
        note: es
          ? `El enlace es para ${user.email}, caduca en ${ttlDays} días y solo se puede usar una vez. Si caduca, crea tu cuenta desde la web con este mismo correo.`
          : `The link is for ${user.email}, expires in ${ttlDays} days and can only be used once. If it expires, sign up on the website with this same email.`,
      },
      siteUrl,
    ),
  };
}

/** Self-registration: the link that confirms the email and creates the account. */
export function signupConfirmEmail(
  person: { name: string; email: string },
  link: string,
  locale: ApiLocale,
  ttlHours: number,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: person.email,
    subject: es ? 'Confirma tu email — Codeqlick' : 'Confirm your email — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Un paso más para crear tu cuenta.'
          : 'One more step to create your account.',
        title: es ? 'Confirma tu email' : 'Confirm your email',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: [
          es
            ? 'Para terminar de crear tu cuenta en Codeqlick, confirma que este correo es tuyo:'
            : 'To finish creating your Codeqlick account, confirm this email is yours:',
        ],
        button: { label: es ? 'Confirmar mi email' : 'Confirm my email', url: link },
        note: es
          ? `El enlace caduca en ${ttlHours} horas. Si no has sido tú, ignora este correo: no se crea ninguna cuenta.`
          : `The link expires in ${ttlHours} hours. If it wasn't you, ignore this email: no account is created.`,
      },
      siteUrl,
    ),
  };
}

/** Someone tried to sign up with an email that already has an account. */
export function alreadyRegisteredEmail(
  user: { name: string; email: string },
  urls: { login: string; reset: string },
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  return {
    to: user.email,
    subject: es ? 'Ya tienes una cuenta en Codeqlick' : 'You already have a Codeqlick account',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? 'Entra con tu email y contraseña.'
          : 'Sign in with your email and password.',
        title: es ? 'Ya tienes una cuenta' : 'You already have an account',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [
          es
            ? `Alguien ha intentado crear una cuenta con ${user.email}, pero ya tienes una. Entra con tu contraseña:`
            : `Someone tried to create an account with ${user.email}, but you already have one. Sign in with your password:`,
        ],
        button: { label: es ? 'Entrar' : 'Sign in', url: urls.login },
        note: es
          ? `¿No la recuerdas? Elige una nueva: ${urls.reset}. Si no has sido tú, ignora este correo.`
          : `Forgot it? Choose a new one: ${urls.reset}. If it wasn't you, ignore this email.`,
      },
      siteUrl,
    ),
  };
}

/** What the new-device email says about the sign-in. */
export interface NewSignIn {
  /** When the sign-in happened. */
  at: Date;
  browser?: string;
  os?: string;
  ip: string | null;
}

/** Madrid time, written for the reader's language: "14 November 2026, 07:45". */
export function formatMadridTime(date: Date, locale: ApiLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

/**
 * To the account after a sign-in from a browser and system it hadn't used before, so a stolen
 * password doesn't go unnoticed (architecture 4.3).
 */
export function newDeviceSignInEmail(
  user: { name: string; email: string },
  signIn: NewSignIn,
  accountUrl: string,
  resetUrl: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  const unknown = es ? 'Desconocido' : 'Unknown';
  const device =
    signIn.browser && signIn.os
      ? es
        ? `${signIn.browser} en ${signIn.os}`
        : `${signIn.browser} on ${signIn.os}`
      : (signIn.browser ?? signIn.os ?? unknown);
  return {
    to: user.email,
    subject: es
      ? 'Nuevo inicio de sesión en tu cuenta — Codeqlick'
      : 'New sign-in to your account — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader: es
          ? `Alguien ha entrado en tu cuenta de Codeqlick desde ${device}.`
          : `Someone signed in to your Codeqlick account from ${device}.`,
        title: es ? 'Nuevo inicio de sesión' : 'New sign-in',
        greeting: es ? `Hola ${user.name}:` : `Hi ${user.name},`,
        intro: [
          es
            ? 'Se ha entrado en tu cuenta de Codeqlick desde un navegador o un dispositivo que no habías usado últimamente:'
            : 'Your Codeqlick account was signed in to from a browser or device you haven’t used lately:',
        ],
        details: [
          [
            es ? 'Cuándo' : 'When',
            `${formatMadridTime(signIn.at, locale)} (${es ? 'hora de Madrid' : 'Madrid time'})`,
          ],
          [es ? 'Dispositivo' : 'Device', device],
          [es ? 'Dirección IP' : 'IP address', signIn.ip ?? unknown],
        ],
        outro: [
          es
            ? 'Si has sido tú, no tienes que hacer nada.'
            : 'If this was you, there’s nothing to do.',
          es
            ? 'Si no has sido tú, cierra esa sesión desde tu cuenta y cambia la contraseña cuanto antes.'
            : 'If it wasn’t you, sign that device out from your account and change your password as soon as possible.',
        ],
        button: {
          label: es ? 'Revisar mis dispositivos' : 'Review my devices',
          url: accountUrl,
        },
        note: es
          ? `¿No puedes entrar? Elige una contraseña nueva aquí: ${resetUrl}`
          : `Can’t sign in? Choose a new password here: ${resetUrl}`,
      },
      siteUrl,
    ),
  };
}
