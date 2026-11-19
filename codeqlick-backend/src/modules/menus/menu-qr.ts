import QRCode from 'qrcode';

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The QR of `url` as an SVG (architecture 4.20): error correction M, a quiet zone of 4 modules,
 * crisp edges, black on white, and a `<title>` for assistive technology.
 */
export async function menuQrSvg(url: string, title: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return svg
    .replace(/^<\?xml[^>]*\?>\s*/, '')
    .replace(/<svg\b([^>]*)>/, (_match, attributes: string) => {
      const base = /shape-rendering=/.test(attributes)
        ? attributes
        : `${attributes} shape-rendering="crispEdges"`;
      return `<svg${base} role="img"><title>${escapeXml(title)}</title>`;
    });
}
