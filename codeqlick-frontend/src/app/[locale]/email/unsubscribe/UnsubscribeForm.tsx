'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import {
  unsubscribeView,
  type UnsubscribeState,
  type UnsubscribeView,
} from '@/lib/email-preferences';
import { setEmailSubscriptionAction } from './actions';
import { InvalidLink } from './InvalidLink';
import styles from './Unsubscribe.module.css';

/** The page's text, translated by the Server Component (with the email's kind and address). */
export type UnsubscribeCopy = Record<UnsubscribeView, string> & {
  unsubscribe: string;
  unsubscribing: string;
  undo: string;
  subscribeAgain: string;
  subscribing: string;
  account: string;
  invalidLink: string;
  signIn: string;
  retry: string;
};

/**
 * A button, not a GET: link previews and mail scanners open the link and must change nothing.
 * The sentence above it is a status region, so the change is announced after each click.
 */
export function UnsubscribeForm({
  token,
  initial,
  copy,
  accountPath,
}: {
  token: string;
  initial: UnsubscribeState;
  copy: UnsubscribeCopy;
  /** My account, with the locale (also where signing in leads from an invalid link). */
  accountPath: string;
}) {
  const [state, formAction] = useActionState(setEmailSubscriptionAction, initial);
  if (state.problem === 'invalidLink') {
    return <InvalidLink message={copy.invalidLink} signIn={copy.signIn} next={accountPath} />;
  }

  const view = unsubscribeView(state);
  // Right after unsubscribing it undoes the click; on an email already off it subscribes again.
  const label = {
    subscribed: copy.unsubscribe,
    resubscribed: copy.unsubscribe,
    unsubscribed: copy.undo,
    alreadyUnsubscribed: copy.subscribeAgain,
  }[view];

  return (
    <div className={styles.body}>
      <p role="status">{copy[view]}</p>
      {state.problem === 'retry' ? <Alert tone="error">{copy.retry}</Alert> : null}
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="subscribed" value={state.subscribed ? 'false' : 'true'} />
        <SubmitButton
          block
          variant={state.subscribed ? 'primary' : 'outline'}
          pendingLabel={state.subscribed ? copy.unsubscribing : copy.subscribing}
        >
          {label}
        </SubmitButton>
      </form>
      <p>
        <Link href="/portal/account" className={styles.link}>
          {copy.account}
        </Link>
      </p>
    </div>
  );
}
