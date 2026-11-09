import type { AppLocale } from '@/i18n/routing';
import { CONTACT_EMAIL } from '@/lib/site';

/** When the policy last changed (shown on the page). */
export const SECURITY_UPDATED = '2026-11-09';

type SecurityPage = { title: string; description: string; markdown: string };

/** The vulnerability disclosure policy (architecture 6, "Security page"). */
export function securityPage(locale: AppLocale): SecurityPage {
  return locale === 'en' ? en : es;
}

const es: SecurityPage = {
  title: 'Seguridad: avísanos de un fallo',
  description:
    'Cómo avisar a Codeqlick de un fallo de seguridad en codeqlick.com o en sus apps, qué entra y cómo respondemos.',
  markdown: `Si has encontrado un fallo de seguridad en Codeqlick, gracias por avisarnos. Lo revisamos todo y respondemos siempre.

## Cómo avisarnos

Escribe a **[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}?subject=Seguridad)** con «Seguridad» en el asunto. Incluye:

- Qué has encontrado y dónde (la dirección exacta).
- Los pasos para reproducirlo, y capturas o una prueba si las tienes.
- Qué podría hacer alguien que lo aprovechara.
- Cómo quieres que te nombremos en el agradecimiento, si quieres que lo hagamos.

## Qué entra

- codeqlick.com y api.codeqlick.com.
- Todas las apps en subdominios de codeqlick.com (videochat, meetings, citas, swipe…).
- Las webs de clientes que publicamos nosotros.

## Qué no entra

- Ataques de denegación de servicio o pruebas que saturen el servidor.
- Spam, ingeniería social o engaños al equipo o a los usuarios.
- Acceso físico a equipos o oficinas.
- Informes automáticos de escáneres sin una prueba de que el fallo se puede aprovechar.
- Buenas prácticas que faltan sin un riesgo real (por ejemplo, una cabecera que no cambia nada).

## Reglas de buena fe

- No accedas, cambies ni borres datos de otras personas más allá de lo mínimo para demostrar el fallo.
- Si ves datos personales, para, no los guardes y avísanos.
- No lo cuentes en público hasta que lo hayamos arreglado.

Si sigues estas reglas, no emprenderemos acciones legales contra ti por tu investigación.

## Qué hacemos nosotros

- Te contestamos en un máximo de 5 días laborables.
- Te contamos qué vamos a hacer y te avisamos cuando esté arreglado.
- Si quieres, te damos las gracias por tu nombre en esta página.

También publicamos este contacto en [/.well-known/security.txt](/.well-known/security.txt).`,
};

const en: SecurityPage = {
  title: 'Security: report a vulnerability',
  description:
    'How to report a security flaw in codeqlick.com or its apps to Codeqlick, what is in scope and how we respond.',
  markdown: `If you have found a security flaw in Codeqlick, thank you for telling us. We review every report and always answer.

## How to report it

Email **[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}?subject=Security)** with "Security" in the subject. Include:

- What you found and where (the exact address).
- The steps to reproduce it, and screenshots or a proof of concept if you have them.
- What someone exploiting it could do.
- How you'd like to be credited, if you'd like to be.

## In scope

- codeqlick.com and api.codeqlick.com.
- Every app on a codeqlick.com subdomain (videochat, meetings, citas, swipe…).
- The client websites we publish.

## Out of scope

- Denial of service, or tests that overload the server.
- Spam, social engineering or tricking the team or users.
- Physical access to devices or offices.
- Automated scanner output without proof the flaw can be exploited.
- Missing best practices with no real risk (for example, a header that changes nothing).

## Good-faith rules

- Don't access, change or delete other people's data beyond the minimum needed to show the flaw.
- If you see personal data, stop, don't keep it, and tell us.
- Don't disclose it publicly until we have fixed it.

If you follow these rules, we won't take legal action against you for your research.

## What we do

- We answer within 5 working days.
- We tell you what we will do and let you know when it's fixed.
- If you want, we thank you by name on this page.

This contact is also published at [/.well-known/security.txt](/.well-known/security.txt).`,
};
