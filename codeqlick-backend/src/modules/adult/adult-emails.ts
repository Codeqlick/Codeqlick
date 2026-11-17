import type { AccountLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/**
 * The shared safety's emails (architecture 4.16): they name "Codeqlick's 18+ apps", never one
 * app, and carry no photo, name or message, so a glance at the inbox gives nothing away. In the
 * six languages of the account.
 */
export type AdultNotice =
  'verification-approved' | 'verification-rejected' | 'verification-withdrawn' | 'suspended';

interface NoticeCopy {
  subject: string;
  body: string;
}

interface AdultCopy {
  notices: Record<AdultNotice, NoticeCopy>;
  noteTitle: string;
  reasonTitle: string;
  until: string;
  permanent: string;
}

const COPY: Record<AccountLocale, AdultCopy> = {
  en: {
    notices: {
      'verification-approved': {
        subject: "You are verified in Codeqlick's 18+ apps",
        body: 'The team checked your photo: from now on your profile carries the "Verified" badge in the three apps. The photo is kept privately while your verification stands; only the team sees it.',
      },
      'verification-rejected': {
        subject: 'Your verification photo was not approved',
        body: 'The team could not approve your photo and deleted it. You can send a new one: you holding a paper with your name in the app, "Codeqlick" and today\'s date.',
      },
      'verification-withdrawn': {
        subject: "Your verification in Codeqlick's 18+ apps was withdrawn",
        body: 'Your profile no longer carries the "Verified" badge in the three apps, and the photo was deleted. You can send a new one.',
      },
      suspended: {
        subject: "Your access to Codeqlick's 18+ apps is suspended",
        body: "The team suspended your access to Codeqlick's 18+ apps after reviewing what happened.",
      },
    },
    noteTitle: "The team's note",
    reasonTitle: 'Reason',
    until: 'Until',
    permanent: 'Until the team lifts it',
  },
  es: {
    notices: {
      'verification-approved': {
        subject: 'Ya estás verificado en las apps +18 de Codeqlick',
        body: 'El equipo ha revisado tu foto: desde ahora tu perfil lleva la insignia «Verificado» en las tres apps. La foto se guarda en privado mientras dure la verificación; solo la ve el equipo.',
      },
      'verification-rejected': {
        subject: 'Tu foto de verificación no se ha aprobado',
        body: 'El equipo no ha podido aprobar tu foto y la ha borrado. Puedes enviar otra: tú sujetando un papel con tu nombre en la app, «Codeqlick» y la fecha de hoy.',
      },
      'verification-withdrawn': {
        subject: 'Se ha retirado tu verificación en las apps +18 de Codeqlick',
        body: 'Tu perfil ya no lleva la insignia «Verificado» en las tres apps y la foto se ha borrado. Puedes enviar otra.',
      },
      suspended: {
        subject: 'Tu acceso a las apps +18 de Codeqlick está suspendido',
        body: 'El equipo ha suspendido tu acceso a las apps +18 de Codeqlick tras revisar lo ocurrido.',
      },
    },
    noteTitle: 'Nota del equipo',
    reasonTitle: 'Motivo',
    until: 'Hasta',
    permanent: 'Hasta que el equipo la levante',
  },
  fr: {
    notices: {
      'verification-approved': {
        subject: 'Vous êtes vérifié dans les apps 18+ de Codeqlick',
        body: "L'équipe a vérifié votre photo : votre profil porte désormais le badge « Vérifié » dans les trois apps. La photo est conservée en privé tant que votre vérification est valable ; seule l'équipe la voit.",
      },
      'verification-rejected': {
        subject: "Votre photo de vérification n'a pas été approuvée",
        body: "L'équipe n'a pas pu approuver votre photo et l'a supprimée. Vous pouvez en envoyer une autre : vous tenant un papier avec votre nom dans l'app, « Codeqlick » et la date du jour.",
      },
      'verification-withdrawn': {
        subject: 'Votre vérification dans les apps 18+ de Codeqlick a été retirée',
        body: 'Votre profil ne porte plus le badge « Vérifié » dans les trois apps et la photo a été supprimée. Vous pouvez en envoyer une autre.',
      },
      suspended: {
        subject: 'Votre accès aux apps 18+ de Codeqlick est suspendu',
        body: "L'équipe a suspendu votre accès aux apps 18+ de Codeqlick après avoir examiné ce qui s'est passé.",
      },
    },
    noteTitle: "Note de l'équipe",
    reasonTitle: 'Motif',
    until: "Jusqu'au",
    permanent: "Jusqu'à ce que l'équipe la lève",
  },
  de: {
    notices: {
      'verification-approved': {
        subject: 'Du bist in den 18+-Apps von Codeqlick verifiziert',
        body: 'Das Team hat dein Foto geprüft: Ab jetzt trägt dein Profil in allen drei Apps das Abzeichen „Verifiziert“. Das Foto wird privat aufbewahrt, solange die Verifizierung besteht; nur das Team sieht es.',
      },
      'verification-rejected': {
        subject: 'Dein Verifizierungsfoto wurde nicht angenommen',
        body: 'Das Team konnte dein Foto nicht annehmen und hat es gelöscht. Du kannst ein neues senden: du mit einem Zettel mit deinem Namen in der App, „Codeqlick“ und dem heutigen Datum.',
      },
      'verification-withdrawn': {
        subject: 'Deine Verifizierung in den 18+-Apps von Codeqlick wurde entzogen',
        body: 'Dein Profil trägt in den drei Apps nicht mehr das Abzeichen „Verifiziert“, und das Foto wurde gelöscht. Du kannst ein neues senden.',
      },
      suspended: {
        subject: 'Dein Zugang zu den 18+-Apps von Codeqlick ist gesperrt',
        body: 'Das Team hat deinen Zugang zu den 18+-Apps von Codeqlick nach Prüfung des Vorfalls gesperrt.',
      },
    },
    noteTitle: 'Hinweis des Teams',
    reasonTitle: 'Grund',
    until: 'Bis',
    permanent: 'Bis das Team sie aufhebt',
  },
  it: {
    notices: {
      'verification-approved': {
        subject: 'Sei verificato nelle app 18+ di Codeqlick',
        body: 'Il team ha controllato la tua foto: da ora il tuo profilo ha il badge «Verificato» nelle tre app. La foto è conservata in privato finché la verifica è valida; la vede solo il team.',
      },
      'verification-rejected': {
        subject: 'La tua foto di verifica non è stata approvata',
        body: "Il team non ha potuto approvare la tua foto e l'ha eliminata. Puoi inviarne un'altra: tu con in mano un foglio con il tuo nome nell'app, «Codeqlick» e la data di oggi.",
      },
      'verification-withdrawn': {
        subject: 'La tua verifica nelle app 18+ di Codeqlick è stata ritirata',
        body: "Il tuo profilo non ha più il badge «Verificato» nelle tre app e la foto è stata eliminata. Puoi inviarne un'altra.",
      },
      suspended: {
        subject: 'Il tuo accesso alle app 18+ di Codeqlick è sospeso',
        body: "Il team ha sospeso il tuo accesso alle app 18+ di Codeqlick dopo aver esaminato l'accaduto.",
      },
    },
    noteTitle: 'Nota del team',
    reasonTitle: 'Motivo',
    until: 'Fino al',
    permanent: 'Finché il team non la revoca',
  },
  pt: {
    notices: {
      'verification-approved': {
        subject: 'Estás verificado nas apps 18+ da Codeqlick',
        body: 'A equipa verificou a tua foto: a partir de agora o teu perfil tem o selo «Verificado» nas três apps. A foto é guardada em privado enquanto a verificação se mantiver; só a equipa a vê.',
      },
      'verification-rejected': {
        subject: 'A tua foto de verificação não foi aprovada',
        body: 'A equipa não pôde aprovar a tua foto e apagou-a. Podes enviar outra: tu a segurar um papel com o teu nome na app, «Codeqlick» e a data de hoje.',
      },
      'verification-withdrawn': {
        subject: 'A tua verificação nas apps 18+ da Codeqlick foi retirada',
        body: 'O teu perfil já não tem o selo «Verificado» nas três apps e a foto foi apagada. Podes enviar outra.',
      },
      suspended: {
        subject: 'O teu acesso às apps 18+ da Codeqlick está suspenso',
        body: 'A equipa suspendeu o teu acesso às apps 18+ da Codeqlick depois de analisar o que aconteceu.',
      },
    },
    noteTitle: 'Nota da equipa',
    reasonTitle: 'Motivo',
    until: 'Até',
    permanent: 'Até a equipa a levantar',
  },
};

const DATE_LOCALES: Record<AccountLocale, string> = {
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
};

/** An email to a member about their verification or a shared suspension. */
export function adultNoticeEmail(
  to: string,
  locale: AccountLocale,
  notice: AdultNotice,
  note: string | null,
  siteUrl: string,
  until: Date | null = null,
): MailMessage {
  const copy = COPY[locale];
  const text = copy.notices[notice];
  const suspended = notice === 'suspended';
  return {
    to,
    subject: text.subject,
    ...renderEmail(
      {
        brand: 'neoqlick',
        locale,
        preheader: text.body,
        title: text.subject,
        intro: [text.body],
        quote: note
          ? { title: suspended ? copy.reasonTitle : copy.noteTitle, body: note }
          : undefined,
        details: suspended
          ? [
              [
                copy.until,
                until
                  ? new Intl.DateTimeFormat(DATE_LOCALES[locale], {
                      dateStyle: 'long',
                      timeStyle: 'short',
                      timeZone: 'UTC',
                    }).format(until) + ' UTC'
                  : copy.permanent,
              ],
            ]
          : undefined,
        signoff: [],
      },
      siteUrl,
    ),
  };
}

/** The team's one digest of the three apps (architecture 4.16): a section per app. */
export function adultDigestEmail(
  to: string,
  sections: Array<{ app: string; rows: Array<[string, number]> }>,
  verifications: number,
  siteUrl: string,
): MailMessage {
  const total =
    verifications +
    sections.reduce((sum, section) => sum + section.rows.reduce((n, [, count]) => n + count, 0), 0);
  return {
    to,
    subject: `18+ apps: ${total} things waiting`,
    ...renderEmail(
      {
        locale: 'en',
        preheader: "New things are waiting in the 18+ apps' moderation.",
        title: 'Waiting in the 18+ apps',
        intro: ['New things arrived since the last digest. People wait for them.'],
        details: [
          ['Verification photos (one queue for the three apps)', String(verifications)],
          ...sections.flatMap((section) =>
            section.rows.map(([label, count]): [string, string] => [
              `${section.app} · ${label}`,
              String(count),
            ]),
          ),
        ],
        button: { label: 'Open the moderation', url: `${siteUrl}/es/admin/cruising` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}
