'use client';

import { useTranslations } from 'next-intl';
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useFormStatus } from 'react-dom';
import { ActionForm, useFormState, type FormAction } from '@/components/app/ActionForm';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import styles from './CruisingTour.module.css';

export type TourStepContent = {
  id: string;
  title: string;
  content: ReactNode;
  /**
   * The id of the step's form (an ActionForm with a `<TourFormStep />` inside): the step's one
   * primary action is then "Save and continue", which submits it and moves on once it is saved.
   */
  formId?: string;
};

type TourControls = { next: () => void; setPending: Dispatch<SetStateAction<boolean>> };

const TourContext = createContext<TourControls | null>(null);

/**
 * Inside a step's form: moves the tour on when the form saves, and lends its pending state to the
 * tour's "Save and continue" button (which sits outside the form, joined with `form=`).
 */
export function TourFormStep() {
  const tour = useContext(TourContext);
  const state = useFormState();
  const { pending } = useFormStatus();

  const setPending = tour?.setPending;
  useEffect(() => {
    setPending?.(pending);
  }, [setPending, pending]);

  // Only a new result moves the tour on (not a re-render with the same one).
  const saved = useEffectEvent(() => tour?.next());
  useEffect(() => {
    if (state.status === 'success') saved();
  }, [state]);

  return null;
}

/**
 * The onboarding tour's frame (decision 102): a compact panel floating over the map (a bottom sheet
 * on phones) that leaves the map in view. One step at a time with Back and one primary action
 * (Next, "Save and continue" on a step with a form, or Done on the last); "Skip" in its header ends
 * it for good, and the chevron folds it down to its header. Each step's content is rendered on the
 * server.
 */
export function TourSteps({
  steps,
  finish,
  start = 0,
}: {
  steps: TourStepContent[];
  finish: FormAction;
  /** The step it opens on (a member who already has a name starts after the name step). */
  start?: number;
}) {
  const t = useTranslations('Cruising.tour');
  const [index, setIndex] = useState(start);
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
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
    setPending(false);
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  };
  const controls: TourControls = { next: () => go(index + 1), setPending };

  return (
    <section
      className={open ? styles.tour : `${styles.tour} ${styles.tourFolded}`}
      aria-labelledby="cruising-tour-title"
    >
      <div className={styles.head}>
        <h2 id="cruising-tour-title" className={styles.title}>
          {t('title')}
        </h2>
        <p className={styles.progress} aria-live="polite">
          <span aria-hidden="true">
            {index + 1}/{steps.length}
          </span>
          <span className={styles.srOnly}>
            {t('progress', { step: index + 1, total: steps.length })}
          </span>
        </p>
        {last ? null : (
          <ActionForm action={finish} className={styles.skip}>
            <SubmitButton variant="ghost" size="sm" pendingLabel={t('saving')}>
              {t('skip')}
            </SubmitButton>
          </ActionForm>
        )}
        <button
          type="button"
          className={styles.fold}
          aria-expanded={open}
          aria-controls="cruising-tour-step"
          aria-label={t('toggle')}
          onClick={() => setOpen(!open)}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
          </svg>
        </button>
      </div>
      <div id="cruising-tour-step" className={styles.step} hidden={!open}>
        <h3 ref={heading} tabIndex={-1} className={styles.stepTitle}>
          {step.title}
        </h3>
        <TourContext value={controls}>
          <div className={styles.body}>{step.content}</div>
        </TourContext>
        <div className={styles.nav}>
          {index > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => go(index - 1)}>
              {t('back')}
            </Button>
          ) : null}
          {step.formId ? (
            <Button type="submit" form={step.formId} size="sm" disabled={pending}>
              {pending ? t('saving') : t('saveAndContinue')}
            </Button>
          ) : last ? (
            <ActionForm action={finish}>
              <SubmitButton size="sm" pendingLabel={t('saving')}>
                {t('done')}
              </SubmitButton>
            </ActionForm>
          ) : (
            <Button size="sm" onClick={() => go(index + 1)}>
              {t('next')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
