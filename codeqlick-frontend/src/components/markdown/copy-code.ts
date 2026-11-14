/** The labels of a code block's copy button, given by the caller (`Markdown` with `copyCode`). */
export type CopyCodeLabels = {
  /** The button at rest: "Copy". */
  copy: string;
  /** For 2 seconds after a copy: "Copied". */
  copied: string;
  /** For 2 seconds after a refused copy: "Couldn't copy". */
  failed: string;
};

/** The part of the Clipboard API the button uses. */
export type TextClipboard = { writeText(text: string): Promise<void> };

/**
 * The text a code block copies: its `code` element's text as written (the `pre`'s when it has
 * none), without the trailing newline Markdown leaves at the end of a fenced block.
 */
export function codeText(pre: Pick<Element, 'querySelector' | 'textContent'>): string {
  const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
  return text.replace(/\r?\n$/, '');
}

/** Copies `text`; false when the browser refuses (no permission, page not focused…). */
export async function copyText(text: string, clipboard: TextClipboard): Promise<boolean> {
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The Clipboard API when this browser offers it (not on old browsers or over plain HTTP). */
export function browserClipboard(): TextClipboard | null {
  if (typeof navigator === 'undefined') return null;
  const clipboard = navigator.clipboard as TextClipboard | undefined;
  return typeof clipboard?.writeText === 'function' ? clipboard : null;
}
