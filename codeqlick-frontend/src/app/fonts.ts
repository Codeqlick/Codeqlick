import { IBM_Plex_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

/** Brand font variables, set on <html> by every document root (locale layout, root 404). */
export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`;
