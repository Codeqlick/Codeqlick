'use client';

import { useOptimistic, useState, useTransition, type DragEvent } from 'react';
import { Link } from '@/i18n/navigation';
import type { Lead, LeadStatus } from '@/lib/api/types';
import { estimatedValue } from '@/lib/lead-value';
import styles from './LeadBoard.module.css';

export type BoardLabels = {
  statuses: Record<LeadStatus, string>;
  budgets: Record<string, string>;
  moveTo: string;
  empty: string;
  estimate: string;
  estimateHint: string;
  failed: string;
  more: string;
};

type Card = Pick<Lead, 'id' | 'name' | 'company' | 'budget' | 'status' | 'createdAt'>;

/**
 * Leads as a board, one column per status. Cards move by drag and drop or with their "Move to"
 * menu (keyboard and touch); the change shows at once and is saved in the background.
 */
export function LeadBoard({
  columns,
  leads,
  totals,
  labels,
  locale,
  move,
}: {
  columns: readonly LeadStatus[];
  leads: Card[];
  /** Leads per status in the database (the board shows at most 50 per column). */
  totals: Partial<Record<LeadStatus, number>>;
  labels: BoardLabels;
  locale: string;
  move: (id: string, status: LeadStatus) => Promise<boolean>;
}) {
  const [cards, moveCard] = useOptimistic(
    leads,
    (current, change: { id: string; status: LeadStatus }) =>
      current.map((card) => (card.id === change.id ? { ...card, status: change.status } : card)),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [over, setOver] = useState<LeadStatus>();

  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  // Same zone on the server and in the browser, so the first render matches.
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Madrid',
  });

  function change(id: string, status: LeadStatus) {
    const card = cards.find((item) => item.id === id);
    if (!card || card.status === status) return;
    setError(false);
    startTransition(async () => {
      moveCard({ id, status });
      if (!(await move(id, status))) setError(true);
    });
  }

  function drop(event: DragEvent<HTMLElement>, status: LeadStatus) {
    event.preventDefault();
    setOver(undefined);
    change(event.dataTransfer.getData('text/plain'), status);
  }

  return (
    <div className={styles.wrap}>
      {error ? (
        <p role="alert" className={styles.error}>
          {labels.failed}
        </p>
      ) : null}
      <div className={styles.board}>
        {columns.map((status) => {
          const inColumn = cards.filter((card) => card.status === status);
          const value = inColumn.reduce((sum, card) => sum + estimatedValue(card.budget), 0);
          const hidden = (totals[status] ?? inColumn.length) - inColumn.length;
          return (
            // Drag and drop is a mouse shortcut; every card's "Move to" menu does the same for
            // keyboard and touch users.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <section
              key={status}
              className={`${styles.column} ${over === status ? styles.over : ''}`}
              aria-label={labels.statuses[status]}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((current) => (current === status ? undefined : current))}
              onDrop={(event) => drop(event, status)}
            >
              <header className={styles.head}>
                <h2 className={styles.title}>
                  {labels.statuses[status]} <span className={styles.count}>{inColumn.length}</span>
                </h2>
                {value > 0 ? (
                  <p className={styles.value} title={labels.estimateHint}>
                    {labels.estimate} {money.format(value)}
                  </p>
                ) : null}
              </header>
              {inColumn.length === 0 ? <p className={styles.empty}>{labels.empty}</p> : null}
              <ul className={styles.cards}>
                {inColumn.map((card) => (
                  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                  <li
                    key={card.id}
                    className={styles.card}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', card.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <Link href={`/admin/leads/${card.id}`} className={styles.name}>
                      {card.name}
                    </Link>
                    {card.company ? <p className={styles.meta}>{card.company}</p> : null}
                    <p className={styles.meta}>
                      {card.budget ? `${labels.budgets[card.budget] ?? card.budget} · ` : ''}
                      {date.format(new Date(card.createdAt))}
                    </p>
                    <label className={styles.move}>
                      <span className="visually-hidden">
                        {labels.moveTo} — {card.name}
                      </span>
                      <select
                        value={card.status}
                        onChange={(event) => change(card.id, event.target.value as LeadStatus)}
                      >
                        {columns.map((option) => (
                          <option key={option} value={option}>
                            {option === card.status
                              ? labels.statuses[option]
                              : `${labels.moveTo}: ${labels.statuses[option]}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
              {hidden > 0 ? (
                <p className={styles.empty}>{labels.more.replace('{count}', String(hidden))}</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
