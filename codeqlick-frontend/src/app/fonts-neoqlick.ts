import localFont from 'next/font/local';

/*
 * Neoqlick's fonts (architecture 4.18), self-hosted like Codeqlick's: Montserrat (SemiBold and
 * Bold, from its variable font) for display headings, to match the wordmark, and the same body
 * and code fonts. Space Grotesk is not loaded on Neoqlick's hosts: this module is only imported
 * for them (`fontVariablesFor`).
 */
const body = localFont({
  src: '../assets/fonts/ibm-plex-sans-latin-wght.woff2',
  weight: '100 700',
  variable: '--font-body',
  display: 'swap',
});
const mono = localFont({
  src: '../assets/fonts/jetbrains-mono-latin-wght.woff2',
  weight: '100 800',
  variable: '--font-mono',
  display: 'swap',
});

export const neoqlickFontVariables = `${body.variable} ${mono.variable}`;
