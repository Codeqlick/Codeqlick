import { NEOQLICK_ICONS, type NeoqlickIconName } from './neoqlick-icons';

/** One of the Neoqlick icons, decorative (`aria-hidden`), drawn in the current text colour. */
export function NeoqlickIcon({ name, size = 24 }: { name: NeoqlickIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: NEOQLICK_ICONS[name] }}
    />
  );
}
