import ReactMarkdown, { type Components } from 'react-markdown';
import styles from './Markdown.module.css';

const SAFE_PROTOCOL = /^(https?:|mailto:|\/|#)/i;

const components: Components = {
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

/**
 * Renders Markdown from the API. Raw HTML is never rendered (react-markdown escapes it by default
 * and we don't add rehype-raw); react-markdown's default `urlTransform` also strips unsafe URLs.
 */
export function Markdown({ children, compact = false }: { children: string; compact?: boolean }) {
  return (
    <div className={[styles.markdown, compact ? styles.compact : ''].filter(Boolean).join(' ')}>
      <ReactMarkdown skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
