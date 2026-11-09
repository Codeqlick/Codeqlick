/**
 * ExoClick ad zones of the video chat (architecture 4.7): Banner 300x250, asynchronous script.
 * An empty ID shows nothing, so each zone turns on with the release that fills it in.
 */
export const VIDEOCHAT_AD_ZONES = {
  /** Room, while looking for someone (no partner video yet). */
  waiting: '6083476',
  /** Room, after "Stop": between conversations. */
  between: '6083482',
  /** Bottom of the landing and of the profile settings. */
  pages: '6083484',
} as const;

export type VideochatAdZone = keyof typeof VIDEOCHAT_AD_ZONES;

/**
 * Swipe's zones (architecture 4.10), same format, own site in ExoClick (swipe.codeqlick.com). Empty
 * until the zones exist in ExoClick: an empty ID shows nothing.
 */
export const SWIPE_AD_ZONES = {
  /** Under the deck. */
  deck: '',
  /** Bottom of the landing and of the matches list. */
  pages: '',
} as const;

export type SwipeAdZone = keyof typeof SWIPE_AD_ZONES;

/** ExoClick's loader and the class its asynchronous tags use. */
export const EXOCLICK_SCRIPT = 'https://a.magsrv.com/ad-provider.js';
export const EXOCLICK_TAG_CLASS = 'eas6a97888e2';

/** Hosts ExoClick serves scripts, frames and beacons from (only the hosts with ads widen their CSP). */
export const EXOCLICK_HOSTS = [
  'https://*.magsrv.com',
  'https://*.exoclick.com',
  'https://*.exosrv.com',
  'https://*.exdynsrv.com',
  'https://*.realsrv.com',
];
