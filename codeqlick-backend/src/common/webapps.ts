/** Codeqlick's web apps, each on its subdomain (architecture 6.3). */
export const CODEQLICK_APPS = ['meetings', 'citas', 'cloud'] as const;
/** Neoqlick's 18+ apps (architecture 4.18); their members are NEOQLICK accounts. */
export const NEOQLICK_APPS = ['videochat', 'swipe', 'cruising'] as const;

/** Every web app of both brands. */
export const WEBAPPS = ['videochat', 'meetings', 'citas', 'swipe', 'cruising', 'cloud'] as const;
export type Webapp = (typeof WEBAPPS)[number];
export type CodeqlickApp = (typeof CODEQLICK_APPS)[number];
export type NeoqlickApp = (typeof NEOQLICK_APPS)[number];

/** The apps whose people are accounts of `realm`. */
export function appsOfRealm(realm: 'CODEQLICK' | 'NEOQLICK'): readonly Webapp[] {
  return realm === 'NEOQLICK' ? NEOQLICK_APPS : CODEQLICK_APPS;
}

export function isNeoqlickApp(app: string | null | undefined): app is NeoqlickApp {
  return (NEOQLICK_APPS as readonly string[]).includes(app ?? '');
}
