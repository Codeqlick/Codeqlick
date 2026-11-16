'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionForm, type FormAction } from '@/components/app/ActionForm';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import styles from './CruisingTour.module.css';

export type TourStepContent = { id: string; title: string; content: ReactNode };

/**
 * The onboarding tour's frame (decision 102): one step at a time with Back and Next, and "Skip" (or
 * "Done" on the last step), which ends it for good. Each step's content is rendered on the server.
 */
export function TourSteps({ steps, finish }: { steps: TourStepContent[]; finish: FormAction }) {
  const t = useTranslations('Cruising.tour');
  const [index, setIndex] = useState(0);
  const moved = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  // After Back or Next, focus goes to the new step's title (not on the first render).
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [index]);

  if (!step) return null;
  const go = (to: number) => {
    moved.current = true;
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  };

  return (
    <section className={styles.tour} aria-labelledby="cruising-tour-title">
      <div className={styles.head}>
        <h2 id="cruising-tour-title" className={styles.title}>
          {t('title')}
        </h2>
        <p className={styles.progress} aria-live="polite">
          {t('progress', { step: index + 1, total: steps.length })}
        </p>
      </div>
      <ol className={styles.dots} aria-hidden="true">
        {steps.map((item, at) => (
          <li
            key={item.id}
            className={at === index ? `${styles.dot} ${styles.dotCurrent}` : styles.dot}
          />
        ))}
      </ol>
      <h3 ref={heading} tabIndex={-1} className={styles.stepTitle}>
        {step.title}
      </h3>
      <div className={styles.body}>{step.content}</div>
      <div className={styles.nav}>
        {index > 0 ? (
          <Button variant="outline" size="sm" onClick={() => go(index - 1)}>
            {t('back')}
          </Button>
        ) : null}
        {last ? null : (
          <Button size="sm" onClick={() => go(index + 1)}>
            {t('next')}
          </Button>
        )}
        <ActionForm action={finish} className={styles.finish}>
          <SubmitButton variant={last ? 'primary' : 'outline'} size="sm" pendingLabel={t('saving')}>
            {last ? t('done') : t('skip')}
          </SubmitButton>
        </ActionForm>
      </div>
    </section>
  );
}
