/**
 * Neoqlick's theme stylesheet (`public/neoqlick/theme.css`: colours, Montserrat headings, symbol),
 * linked on Neoqlick's hosts only. React hoists it into <head> and loads it before the content
 * paints. Codeqlick's pages never reference it (decision 125).
 */
export function NeoqlickThemeLink() {
  // The rule wants stylesheets imported (bundled), which is exactly what this file avoids.
  // oxlint-disable-next-line next/no-css-tags
  return <link rel="stylesheet" href="/neoqlick/theme.css" precedence="default" />;
}
