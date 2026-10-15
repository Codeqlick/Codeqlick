import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/** Size social networks expect for a large preview card. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

const COLORS = {
  ink: '#14101F',
  fuchsia: '#D9177E',
  fuchsiaLight: '#FF7DBE',
  white: '#FFFFFF',
  muted: '#C9C2D1',
};

type FontSpec = { name: string; file: string; weight: 400 | 500 | 700 };

/** Brand fonts (OFL), as WOFF: the image renderer reads neither WOFF2 nor Google Fonts URLs. */
const FONTS: FontSpec[] = [
  { name: 'Space Grotesk', file: 'space-grotesk-latin-700-normal.woff', weight: 700 },
  { name: 'IBM Plex Sans', file: 'ibm-plex-sans-latin-400-normal.woff', weight: 400 },
  { name: 'JetBrains Mono', file: 'jetbrains-mono-latin-500-normal.woff', weight: 500 },
];

let fonts:
  Promise<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts']> | undefined;

/** Read once per server process; `public/` ships next to the standalone server. */
function loadFonts() {
  fonts ??= Promise.all(
    FONTS.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: 'normal' as const,
      data: await readFile(join(process.cwd(), 'public', 'og-fonts', font.file)),
    })),
  );
  return fonts;
}

/** Long titles get a smaller size so that they fit in three lines. */
function titleSize(title: string): number {
  if (title.length <= 40) return 76;
  if (title.length <= 70) return 64;
  if (title.length <= 100) return 54;
  return 46;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Social preview image for a page without a cover: the brand mark, a small label (`eyebrow`,
 * e.g. "Blog · 12 Oct 2026"), the title and the site's host, on the ink background.
 */
export async function renderOgImage({
  eyebrow,
  title,
  host,
}: {
  eyebrow: string;
  title: string;
  host: string;
}): Promise<ImageResponse> {
  const text = clip(title, 140);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        backgroundColor: COLORS.ink,
        color: COLORS.white,
        fontFamily: 'IBM Plex Sans',
        position: 'relative',
      }}
    >
      {/* The ring of the logo, large and cut by the right edge. */}
      <div
        style={{
          position: 'absolute',
          right: -210,
          bottom: -210,
          width: 500,
          height: 500,
          borderRadius: 9999,
          border: `110px solid ${COLORS.fuchsia}`,
          opacity: 0.9,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <svg width="56" height="56" viewBox="0 0 64 64">
          <circle cx="28" cy="28" r="18" fill="none" stroke={COLORS.white} strokeWidth="8" />
          <path d="M36 36 L60 45 L49 48 L46 59 Z" fill={COLORS.fuchsia} />
        </svg>
        <div
          style={{
            fontFamily: 'Space Grotesk',
            fontWeight: 700,
            fontSize: 40,
            letterSpacing: -1,
          }}
        >
          codeqlick
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 780 }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono',
            fontWeight: 500,
            fontSize: 24,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: COLORS.fuchsiaLight,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontFamily: 'Space Grotesk',
            fontWeight: 700,
            fontSize: titleSize(text),
            lineHeight: 1.08,
            letterSpacing: -2,
          }}
        >
          {text}
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: 26, color: COLORS.muted }}>{host}</div>
    </div>,
    {
      ...OG_IMAGE_SIZE,
      fonts: await loadFonts(),
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
