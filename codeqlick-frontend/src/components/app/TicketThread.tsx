import { Badge } from '@/components/ui/Badge';
import type { AppLocale } from '@/i18n/routing';
import type { TicketMessage } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import styles from './app.module.css';

/** The messages of a support request, oldest first; the team's are highlighted. */
export function TicketThread({
  messages,
  locale,
  label,
}: {
  messages: TicketMessage[];
  locale: AppLocale;
  label: string;
}) {
  return (
    <ol className={styles.comments} aria-label={label}>
      {messages.map((message) => (
        <li
          key={message.id}
          className={`${styles.comment} ${message.author.team ? styles.commentTeam : ''}`}
        >
          <p className={styles.commentMeta}>
            <strong>{message.author.name}</strong>
            {message.author.team ? <Badge tone="brand">Codeqlick</Badge> : null}
            <span>{formatDateTime(message.createdAt, locale)}</span>
          </p>
          <p className={styles.commentBody}>{message.body}</p>
        </li>
      ))}
    </ol>
  );
}
