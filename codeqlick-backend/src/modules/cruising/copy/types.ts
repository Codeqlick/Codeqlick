/**
 * The texts Cruising's emails and push notifications say, per language (decision 103). English and
 * Spanish live next to the code that uses them; French, German, Italian and Portuguese each have
 * their own file in this folder, typed by `CruisingCopy` so none can miss a text.
 */
import type { CruisingNotice } from '../cruising-emails.js';
import type { PushKind } from '../cruising.rules.js';

/** To whoever asked for a removal (`cruisingTakedownEmail`). */
export interface TakedownCopy {
  receivedSubject: string;
  receivedTitle: string;
  received: string;
  removedSubject: string;
  removedTitle: string;
  removed: string;
  closedSubject: string;
  closedTitle: string;
  closed: string;
  answer: string;
  reference: string;
}

/** A notice to a member (`cruisingNoticeEmail`). */
export type NoticeCopy = Record<
  CruisingNotice,
  { subject: string; body: string; button: string }
> & {
  reasonTitle: string;
  until: string;
  permanent: string;
  settings: string;
};

/** The double opt-in invitation to a trusted contact (`contactInviteEmail`). */
export interface InviteCopy {
  subject: (name: string) => string;
  title: string;
  intro: (name: string) => readonly string[];
  button: string;
  outro: (stopUrl: string) => readonly string[];
  note: (name: string) => string;
}

/** To a trusted contact when a timer runs out (`contactAlertEmail`). */
export interface AlertCopy {
  subject: (name: string) => string;
  title: string;
  intro: (name: string) => readonly string[];
  message: string;
  time: string;
  place: string;
  map: string;
  button: string;
  outro: (stopUrl: string) => readonly string[];
  note: string;
}

/** To the member: the timer's reminder or the check-up reminder (`memberSafetyEmail`). */
export interface MemberSafetyCopy {
  timer: { subject: string; body: string; button: string };
  health: { subject: string; body: string; button: string };
  settings: string;
}

/** Everything Cruising writes in one language. */
export interface CruisingCopy {
  takedown: TakedownCopy;
  notice: NoticeCopy;
  invite: InviteCopy;
  alert: AlertCopy;
  member: MemberSafetyCopy;
  /** Push texts of the safety timer and the check-up reminder. */
  safetyPush: { timer: string; health: string };
  /** Push texts of the other notifications (`pushPayload`). */
  push: Record<PushKind, string>;
}
