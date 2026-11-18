/** Codeqlick's own web apps, each on its subdomain (architecture 6.3). */
export const WEBAPPS = ['meetings', 'citas', 'cloud'] as const;
export type Webapp = (typeof WEBAPPS)[number];
