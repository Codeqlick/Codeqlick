import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

/** Alert for the team: someone reported a person who may be a minor. No personal data in it. */
export function minorReportEmail(to: string, reportId: string, siteUrl: string): MailMessage {
  return {
    to,
    subject: 'Video chat: possible minor reported',
    ...renderEmail(
      {
        locale: 'en',
        preheader: 'Review it first: someone reported a person who may be under 18.',
        title: 'Possible minor in the video chat',
        intro: [
          'Someone in the video chat reported the person they were talking to as possibly under 18.',
          'Review the report and suspend the account if it is confirmed.',
        ],
        details: [['Report id', reportId]],
        button: { label: 'Open the reports', url: `${siteUrl}/es/admin/videochat` },
        signoff: [],
      },
      siteUrl,
    ),
  };
}

const APPEAL_COPY = {
  es: {
    accepted: {
      subject: 'Hemos levantado tu suspensión en el videochat',
      title: 'Vuelves a tener acceso',
      intro: 'Hemos revisado tu apelación y levantado la suspensión. Ya puedes volver a entrar.',
    },
    rejected: {
      subject: 'Hemos revisado tu apelación en el videochat',
      title: 'La suspensión se mantiene',
      intro: 'Hemos revisado tu apelación y la suspensión se mantiene.',
    },
    greeting: (name: string) => `Hola ${name}:`,
    answer: 'Respuesta del equipo',
    button: 'Ir al videochat',
  },
  en: {
    accepted: {
      subject: 'Your video chat suspension was lifted',
      title: 'You have access again',
      intro: 'We reviewed your appeal and lifted the suspension. You can come back in.',
    },
    rejected: {
      subject: 'We reviewed your video chat appeal',
      title: 'The suspension stays',
      intro: 'We reviewed your appeal and the suspension stays in place.',
    },
    greeting: (name: string) => `Hi ${name},`,
    answer: "The team's answer",
    button: 'Go to the video chat',
  },
} as const;

/** Tells the person how the team resolved their appeal. */
export function appealResolvedEmail(
  person: { to: string; name: string; locale: 'es' | 'en' },
  decision: { accepted: boolean; response: string | null },
  videochatUrl: string,
  siteUrl: string,
): MailMessage {
  const copy = APPEAL_COPY[person.locale];
  const outcome = decision.accepted ? copy.accepted : copy.rejected;
  return {
    to: person.to,
    subject: `${outcome.subject} — Codeqlick`,
    ...renderEmail(
      {
        locale: person.locale,
        preheader: outcome.intro,
        title: outcome.title,
        greeting: copy.greeting(person.name),
        intro: [outcome.intro],
        quote: decision.response ? { title: copy.answer, body: decision.response } : undefined,
        button: { label: copy.button, url: `${videochatUrl}/${person.locale}` },
      },
      siteUrl,
    ),
  };
}
