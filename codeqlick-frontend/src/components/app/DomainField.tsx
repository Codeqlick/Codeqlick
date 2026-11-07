'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { DomainAvailability } from '@/lib/api/types';
import { checkDomainAction } from '@/lib/domains/actions';
import { useFormState } from './ActionForm';
import styles from './DomainField.module.css';

export type DomainFieldLabels = {
  check: string;
  checking: string;
  free: string;
  taken: string;
  unknown: string;
  use: string;
  invalid: string;
  failed: string;
};

/**
 * A domain input inside an ActionForm with a "check" button: lists whether the name is free in
 * .com, .es and .eu (OVH or the registry, through the API) and fills the input with a free one.
 */
export function DomainField({
  id,
  name,
  label,
  hint,
  defaultValue = '',
  labels,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  labels: DomainFieldLabels;
}) {
  const state = useFormState();
  const submitted = state.values?.[name];
  const [value, setValue] = useState(typeof submitted === 'string' ? submitted : defaultValue);
  const [results, setResults] = useState<DomainAvailability[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = () =>
    startTransition(async () => {
      const answer = await checkDomainAction(value);
      if ('error' in answer) {
        setResults(null);
        setProblem(labels[answer.error]);
      } else {
        setProblem(null);
        setResults(answer.results);
      }
    });

  return (
    <div className={styles.domain}>
      <div className={styles.line}>
        <Input
          id={id}
          name={name}
          label={label}
          hint={hint}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              check();
            }
          }}
          error={state.fieldErrors?.[name]}
          autoComplete="off"
          spellCheck={false}
          maxLength={253}
          placeholder="peluqueria-ana.com"
        />
        <Button variant="outline" size="sm" onClick={check} disabled={pending || !value.trim()}>
          {pending ? labels.checking : labels.check}
        </Button>
      </div>
      <div aria-live="polite">
        {problem ? <p className={styles.problem}>{problem}</p> : null}
        {results ? (
          <ul className={styles.results}>
            {results.map((result) => (
              <li key={result.domain}>
                <span className={styles.name}>{result.domain}</span>
                <Badge
                  tone={
                    result.available === true
                      ? 'success'
                      : result.available === false
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {result.available === true
                    ? labels.free
                    : result.available === false
                      ? labels.taken
                      : labels.unknown}
                </Badge>
                {result.available !== false && result.domain !== value.trim().toLowerCase() ? (
                  <Button variant="ghost" size="sm" onClick={() => setValue(result.domain)}>
                    {labels.use}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
