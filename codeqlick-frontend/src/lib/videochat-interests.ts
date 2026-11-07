/** The video chat's profile interests (the API's fixed list; architecture 4.7). */

export const INTERESTS = [
  'chat',
  'friends',
  'flirting',
  'music',
  'movies',
  'series',
  'gaming',
  'sports',
  'fitness',
  'travel',
  'books',
  'art',
  'photography',
  'tech',
  'food',
  'anime',
  'languages',
  'nature',
  'pets',
  'fashion',
  // Adult (+18) interests: the video chat allows explicit content between consenting adults.
  'spicy',
  'explicit',
  'showing',
  'watching',
  'roleplay',
  'fetish',
  'bdsm',
  'striptease',
  'mutual',
  'couples',
  'lgbtq',
  'nostrings',
] as const;
export type Interest = (typeof INTERESTS)[number];
export const MAX_INTERESTS = 5;

export function isInterest(value: unknown): value is Interest {
  return (INTERESTS as readonly unknown[]).includes(value);
}

/** The +18 ones, shown in their own group on the profile. */
export const ADULT_INTERESTS: readonly Interest[] = [
  'spicy',
  'explicit',
  'showing',
  'watching',
  'roleplay',
  'fetish',
  'bdsm',
  'striptease',
  'mutual',
  'couples',
  'lgbtq',
  'nostrings',
];
