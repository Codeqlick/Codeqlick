/**
 * Cruising's profile pages (architecture 4.15, "Profile pages"): the sections of a member's
 * profile and of `/me`, the initials shown without a cover photo and what my profile still misses.
 */

/** The sections of a member's profile, in the sub-nav's order (each is an anchor on the page). */
export const MEMBER_SECTIONS = ['photos', 'reviews', 'spots', 'meetups'] as const;
export type MemberSection = (typeof MEMBER_SECTIONS)[number];

/** The sections of `/me`, in the sub-nav's order (each is an anchor on the page). */
export const ME_SECTIONS = [
  'profile',
  'photos',
  'verification',
  'notifications',
  'safety',
  'privacy',
] as const;
export type MeSection = (typeof ME_SECTIONS)[number];

/** The sections of `/me` that need a nickname first (the API refuses them without one). */
const NEED_NICKNAME: readonly MeSection[] = ['photos', 'verification'];

/** The sections `/me` shows: before a nickname, only those that don't need one. */
export function meSections(hasNickname: boolean): MeSection[] {
  return ME_SECTIONS.filter((section) => hasNickname || !NEED_NICKNAME.includes(section));
}

/**
 * Up to two letters for an avatar without a cover photo: the first letters of the nickname's first
 * two words (split at `_` and digits), else its first two letters.
 */
export function initials(nickname: string): string {
  const words = nickname.split(/[_\d]+/).filter(Boolean);
  const letters =
    words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? nickname).slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** Something my profile misses, and the anchor of `/me` where it is added. */
export const PROFILE_GAPS = {
  nickname: 'profile',
  photo: 'photos',
  bio: 'profile',
  lookingFor: 'profile',
  country: 'profile',
  verification: 'verification',
} as const satisfies Record<string, MeSection>;
export type ProfileGap = keyof typeof PROFILE_GAPS;

export type Completeness = {
  /** How many of the steps are done, out of `total`. */
  done: number;
  total: number;
  /** 0 to 100, rounded. */
  percent: number;
  /** What is left, in the order to do it. */
  missing: ProfileGap[];
};

/**
 * How complete my profile is: a nickname, a photo, a bio, what I'm looking for, my country and
 * verification (a pending verification counts as done: there's nothing left for me to do).
 */
export function profileCompleteness(input: {
  profile: { bio: string; country: string | null; lookingFor: readonly string[] } | null;
  hasPhoto: boolean;
  verification: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  verified: boolean;
}): Completeness {
  const { profile } = input;
  const steps: [ProfileGap, boolean][] = [
    ['nickname', profile !== null],
    ['photo', input.hasPhoto],
    ['bio', Boolean(profile?.bio.trim())],
    ['lookingFor', (profile?.lookingFor.length ?? 0) > 0],
    ['country', Boolean(profile?.country)],
    ['verification', input.verified || input.verification === 'PENDING'],
  ];
  const missing = steps.filter(([, ok]) => !ok).map(([gap]) => gap);
  const total = steps.length;
  const done = total - missing.length;
  return { done, total, percent: Math.round((done / total) * 100), missing };
}
