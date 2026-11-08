/**
 * Contact details in a chat message: a phone number, an email, a link or a domain, or an outside
 * app or handle. Swipe refuses them until both people have talked a little (architecture 4.10):
 * scammers and spammers go straight for them.
 */
const PATTERNS: RegExp[] = [
  // 7 or more digits, maybe split by spaces, dots, dashes or brackets: +34 612 345 678.
  /(?:\+|00)?\d(?:[\s.\-()]*\d){6,}/,
  // An email address.
  /[\p{L}\p{N}._%+-]+\s*(?:@|\(at\)|\[at\])\s*[\p{L}\p{N}-]+\s*(?:\.|\(dot\)|\[dot\])\s*[a-z]{2,}/iu,
  // A link or a bare domain: https://…, www.…, something.com.
  /https?:\/\/|www\.|\b[\p{L}\p{N}-]+\s*\.\s*(?:com|net|org|es|io|me|app|link|ly|co|xyz|info|site|online|fans|tv|be|gg)\b/iu,
  // Outside apps and their usual spellings.
  /\b(?:whats\s*app|wasap|wsp|wpp|telegram|tlgrm|insta(?:gram)?|ig|snap(?:chat)?|onlyfans|only\s*fans|fansly|kik|signal|tiktok|facebook|fb|twitter|discord|skype|line|wechat|viber|bizum|paypal)\b/iu,
  // A handle: @name.
  /(?:^|\s)@[\p{L}\p{N}._]{3,}/u,
];

/** Whether a message shares a way to reach someone outside Swipe. */
export function sharesContact(text: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(text));
}
