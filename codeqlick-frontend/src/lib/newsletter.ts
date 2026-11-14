/**
 * Bot checks of the newsletter sign-up, the same two as the contact form: a filled honeypot, and a
 * submission made sooner than a person can read the box and type an address.
 */
export const NEWSLETTER_MIN_FILL_MS = 3000;

export function looksAutomated(input: {
  /** The honeypot field's value. */
  website: string;
  /** What the form carried as the time it was shown (milliseconds since the epoch), as text. */
  renderedAt: string;
  now: number;
}): boolean {
  if (input.website !== '') return true;
  const renderedAt = Number(input.renderedAt);
  // No usable timestamp (the browser stamps it with JavaScript, so a form sent without it comes
  // from someone with scripts off): only the honeypot applies.
  if (!Number.isFinite(renderedAt) || renderedAt <= 0) return false;
  return input.now - renderedAt < NEWSLETTER_MIN_FILL_MS;
}

/**
 * The post's `newsletter` value to send with the editor's form. Once the post's email went out
 * the checkbox is disabled, so the browser leaves it out of the form: nothing must be sent then
 * (an absent box would read as "unticked").
 */
export function newsletterChoice(alreadySent: boolean, ticked: boolean): boolean | undefined {
  return alreadySent ? undefined : ticked;
}
