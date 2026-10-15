import type { ReactNode } from 'react';
import type { Testimonial } from '@/lib/api/types';
import styles from './TestimonialQuote.module.css';

/** A client's words about a case study: the quote, who said it and their role. */
export function TestimonialQuote({
  testimonial,
  className,
  children,
}: {
  testimonial: Testimonial;
  className?: string;
  /** Rendered under the author (e.g. a link to the case study). */
  children?: ReactNode;
}) {
  return (
    <figure className={`${styles.figure} ${className ?? ''}`}>
      <span className={styles.mark} aria-hidden="true">
        “
      </span>
      <blockquote className={styles.quote}>
        <p>{testimonial.quote}</p>
      </blockquote>
      <figcaption className={styles.caption}>
        <span className={styles.author}>{testimonial.author}</span>
        {testimonial.role ? <span className={styles.role}>{testimonial.role}</span> : null}
      </figcaption>
      {children}
    </figure>
  );
}
