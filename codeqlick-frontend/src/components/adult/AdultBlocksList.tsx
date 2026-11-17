import type { ReactNode } from 'react';
import { blockApp, blockLabel, type BlockedMember } from '@/lib/adult';
import styles from './AdultBlocks.module.css';

type Props = {
  blocks: readonly BlockedMember[];
  /** "A member of another 18+ app": the name of someone who has none in this app. */
  otherApp: string;
  /** "blocked on {date}" and "blocked in {app} on {date}". */
  blockedOn: (date: string) => string;
  blockedIn: (app: string, date: string) => string;
  /** The date as the page's language writes it. */
  date: (iso: string) => string;
  /** The Unblock control of one block (a form posting to the Server Action). */
  action: (block: BlockedMember) => ReactNode;
};

/**
 * The blocks list the three 18+ apps share (architecture 4.16, decision 112): every block with the
 * app where it was made, naming the person by their name in the current app. Lifting one lifts it
 * in all three, which the caller's lead text says.
 */
export function AdultBlocksList({ blocks, otherApp, blockedOn, blockedIn, date, action }: Props) {
  return (
    <ul className={styles.list}>
      {blocks.map((block) => {
        const app = blockApp(block);
        const when = date(block.createdAt);
        return (
          <li key={block.ref} className={styles.item}>
            <span>
              <strong>{blockLabel(block, otherApp)}</strong>{' '}
              <span className={styles.muted}>{app ? blockedIn(app, when) : blockedOn(when)}</span>
            </span>
            {action(block)}
          </li>
        );
      })}
    </ul>
  );
}
