import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { remarkHeadingAnchors } from '@/lib/markdown-outline';
import styles from './Markdown.module.css';

const SAFE_PROTOCOL = /^(https?:|mailto:|\/|#)/i;

const components: Components = {
  img({ alt, node: _node, ...rest }) {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary URLs from the content
    return <img {...rest} alt={alt ?? ''} loading="lazy" decoding="async" />;
  },
  a({ href, children, node: _node, ...rest }) {
    const safeHref = href && SAFE_PROTOCOL.test(href) ? href : undefined;
    const external = safeHref ? /^https?:/i.test(safeHref) : false;
    return (
      <a
        {...rest}
        href={safeHref}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    );
  },
};

/** Headings ending with a "#" link to their own anchor (the id comes from `remarkHeadingAnchors`). */
function anchoredComponents(linkLabel: string): Components {
  const link = (id: unknown): ReactNode =>
    typeof id === 'string' ? (
      <a href={`#${id}`} className={styles.anchor} aria-label={linkLabel}>
        #
      </a>
    ) : null;
  return {
    ...components,
    h2({ children, node: _node, ...rest }) {
      return (
        <h2 {...rest} className={styles.anchored}>
          {children}
          {link(rest.id)}
        </h2>
      );
    },
    h3({ children, node: _node, ...rest }) {
      return (
        <h3 {...rest} className={styles.anchored}>
          {children}
          {link(rest.id)}
        </h3>
      );
    },
  };
}

/**
 * Renders Markdown from the API. Raw HTML is never rendered (react-markdown escapes it by default
 * and we don't add rehype-raw); react-markdown's default `urlTransform` also strips unsafe URLs.
 *
 * With `anchors` (blog posts, case studies, legal pages) every `##` and `###` gets the id
 * `getOutline` gives it and a "#" link to it labelled `anchors.linkLabel`; elsewhere headings
 * keep no ids.
 */
export function Markdown({
  children,
  compact = false,
  anchors,
}: {
  children: string;
  compact?: boolean;
  anchors?: { linkLabel: string };
}) {
  return (
    <div className={[styles.markdown, compact ? styles.compact : ''].filter(Boolean).join(' ')}>
      {anchors ? (
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkHeadingAnchors]}
          components={anchoredComponents(anchors.linkLabel)}
        >
          {children}
        </ReactMarkdown>
      ) : (
        <ReactMarkdown skipHtml components={components}>
          {children}
        </ReactMarkdown>
      )}
    </div>
  );
}
