/**
 * ExoClick ad zones of the video chat (architecture 4.7): Banner 300x250, asynchronous script.
 * An empty ID shows nothing, so each zone turns on with the release that fills it in.
 */
export const VIDEOCHAT_AD_ZONES = {
  /** Room, while looking for someone (no partner video yet). */
  waiting: '',
  /** Room, after "Stop": between conversations. */
  between: '',
  /** Bottom of the landing and of the profile settings. */
  pages: '',
} as const;

export type VideochatAdZone = keyof typeof VIDEOCHAT_AD_ZONES;

/** ExoClick's loader and the class its asynchronous tags use. */
export const EXOCLICK_SCRIPT = 'https://a.magsrv.com/ad-provider.js';
export const EXOCLICK_TAG_CLASS = 'eas6a97888e';

/** Hosts ExoClick serves scripts, frames and beacons from (the video chat host's CSP only). */
export const EXOCLICK_HOSTS = [
  'https://*.magsrv.com',
  'https://*.exoclick.com',
  'https://*.exosrv.com',
  'https://*.exdynsrv.com',
  'https://*.realsrv.com',
];
