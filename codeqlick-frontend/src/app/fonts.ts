import localFont from 'next/font/local';

/*
 * Brand fonts, self-hosted: the latin subset of each variable font (OFL, from Fontsource) lives
 * in src/assets/fonts, so builds don't depend on reaching Google Fonts.
 */
const display = localFont({
  src: '../assets/fonts/space-grotesk-latin-wght.woff2',
  weight: '300 700',
  variable: '--font-display',
  display: 'swap',
});
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

/** Brand font variables, set on <html> by every document root (locale layout, root 404). */
export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`;
