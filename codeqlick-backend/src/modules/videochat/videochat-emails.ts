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
