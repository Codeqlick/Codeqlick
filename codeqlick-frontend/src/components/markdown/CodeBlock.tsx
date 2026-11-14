'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { browserClipboard, codeText, copyText, type CopyCodeLabels } from './copy-code';
import styles from './Markdown.module.css';

const noSubscribe = () => () => {};
const hasClipboard = () => browserClipboard() !== null;
const onServer = () => false;

/** How long the button says "Copied" or "Couldn't copy". */
const FEEDBACK_MS = 2000;

/**
 * A code block of `Markdown` with `copyCode` (architecture 6.2): the server-rendered `pre`
 * plus a "Copy" button in its top-right corner. The button only appears once the page runs in a
 * browser with the Clipboard API (none on the server, so hydration matches).
 */
export function CodeBlock({ children, labels }: { children: ReactNode; labels: CopyCodeLabels }) {
  const pre = useRef<HTMLPreElement>(null);
  const supported = useSyncExternalStore(noSubscribe, hasClipboard, onServer);
  // A new object on every press, so pressing again restarts the 2 seconds.
  const [result, setResult] = useState<{ status: 'copied' | 'failed' } | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy() {
    const clipboard = browserClipboard();
    const ok = pre.current && clipboard ? await copyText(codeText(pre.current), clipboard) : false;
    setResult({ status: ok ? 'copied' : 'failed' });
  }

  const message = result ? (result.status === 'copied' ? labels.copied : labels.failed) : '';

  return (
    <div className={styles.codeBlock}>
      <pre ref={pre}>{children}</pre>
      {supported ? (
        <>
          <button
            type="button"
            className={styles.copyButton}
            data-status={result?.status}
            onClick={copy}
          >
            {message || labels.copy}
          </button>
          <output className="visually-hidden">{message}</output>
        </>
      ) : null}
    </div>
  );
}
