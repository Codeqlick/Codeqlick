import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { renderEmail } from '../mail/email-layout.js';
import type { MailMessage } from '../mail/mail.service.js';

export interface DigestProject {
  id: string;
  name: string;
  phase: string;
  progress: number;
  updates: string[];
  milestonesDone: string[];
  nextMilestone: { title: string; dueDate: Date | null } | null;
  awaitingApproval: string[];
}

const PHASES: Record<ApiLocale, Record<string, string>> = {
  es: {
    DISCOVERY: 'Descubrimiento',
    DESIGN: 'Diseño',
    DEVELOPMENT: 'Desarrollo',
    QA: 'Pruebas',
    LAUNCHED: 'Lanzado',
    SUPPORT: 'Soporte',
    ON_HOLD: 'En pausa',
  },
  en: {
    DISCOVERY: 'Discovery',
    DESIGN: 'Design',
    DEVELOPMENT: 'Development',
    QA: 'QA',
    LAUNCHED: 'Launched',
    SUPPORT: 'Support',
    ON_HOLD: 'On hold',
  },
};

/** Something to tell: news this week, or something waiting for the client. */
export function digestHasNews(projects: DigestProject[]): boolean {
  return projects.some(
    (p) => p.updates.length > 0 || p.milestonesDone.length > 0 || p.awaitingApproval.length > 0,
  );
}

/** Monday summary of a client's projects, in their language. */
export function weeklyDigestEmail(
  client: { name: string; email: string },
  projects: DigestProject[],
  portalUrl: string,
  accountUrl: string,
  locale: ApiLocale,
  siteUrl: string,
): MailMessage {
  const es = locale === 'es';
  const date = (value: Date) =>
    new Intl.DateTimeFormat(es ? 'es-ES' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Madrid',
    }).format(value);
  const pending = projects.reduce((sum, p) => sum + p.awaitingApproval.length, 0);

  const quote = projects.map((project) => {
    const lines = [
      `${PHASES[locale][project.phase] ?? project.phase} · ${project.progress} %`,
      ...project.updates.map((title) => (es ? `• Novedad: ${title}` : `• Update: ${title}`)),
      ...project.milestonesDone.map((title) =>
        es ? `✓ Hito completado: ${title}` : `✓ Milestone done: ${title}`,
      ),
      ...project.awaitingApproval.map((title) =>
        es ? `→ Pendiente de tu aprobación: ${title}` : `→ Waiting for your approval: ${title}`,
      ),
    ];
    if (project.nextMilestone) {
      const due = project.nextMilestone.dueDate ? ` (${date(project.nextMilestone.dueDate)})` : '';
      lines.push(
        es
          ? `Siguiente hito: ${project.nextMilestone.title}${due}`
          : `Next milestone: ${project.nextMilestone.title}${due}`,
      );
    }
    return { title: project.name, body: lines.join('\n') };
  });

  return {
    to: client.email,
    subject: es ? 'Tu resumen semanal — Codeqlick' : 'Your weekly summary — Codeqlick',
    ...renderEmail(
      {
        locale,
        preheader:
          pending > 0
            ? es
              ? `Tienes ${pending} ${pending === 1 ? 'entrega pendiente' : 'entregas pendientes'} de aprobar.`
              : `You have ${pending} ${pending === 1 ? 'delivery' : 'deliveries'} to approve.`
            : es
              ? 'Lo que ha pasado esta semana en tus proyectos.'
              : 'What happened this week on your projects.',
        title: es ? 'Tu resumen de la semana' : 'Your week in summary',
        greeting: es ? `Hola ${client.name}:` : `Hi ${client.name},`,
        intro: [
          es
            ? 'Esto es lo que ha pasado en tus proyectos durante los últimos siete días:'
            : "Here's what happened on your projects over the last seven days:",
        ],
        quote,
        button: { label: es ? 'Abrir mi área de cliente' : 'Open my client area', url: portalUrl },
        note: es
          ? `Te lo enviamos cada lunes cuando hay novedades. Puedes desactivarlo en tu cuenta: ${accountUrl}`
          : `We send it every Monday when there's news. You can turn it off in your account: ${accountUrl}`,
      },
      siteUrl,
    ),
  };
}
