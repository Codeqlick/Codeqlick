import { Link } from '@/i18n/navigation';
import styles from './Unsubscribe.module.css';

/**
 * A link the API doesn't know (or of a deleted account): sends the person to sign in, then to My
 * account, where every email preference can be changed. Shown by the page and by the form.
 */
export function InvalidLink({
  message,
  signIn,
  next,
}: {
  message: string;
  signIn: string;
  /** Where to land after signing in (My account). */
  next: string;
}) {
  return (
    <div className={styles.body}>
      <p role="status">{message}</p>
      <p>
        <Link href={{ pathname: '/login', query: { next } }} className={styles.link}>
          {signIn}
        </Link>
      </p>
    </div>
  );
}
