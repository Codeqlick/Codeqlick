/** Codeqlick's own web apps, each on its subdomain (architecture 6.3). */
export const WEBAPPS = ['videochat', 'meetings'] as const;
export type Webapp = (typeof WEBAPPS)[number];
