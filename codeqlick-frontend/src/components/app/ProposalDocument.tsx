import { getTranslations } from 'next-intl/server';
import { Markdown } from '@/components/markdown/Markdown';
import { Logo } from '@/components/brand/Logo';
import type { AppLocale } from '@/i18n/routing';
import type { Proposal } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/format';
import styles from './ProposalDocument.module.css';

/**
 * A proposal laid out as a document, the same for the client and the team: header, scope, the
 * priced lines with the total, and the terms. Prints cleanly (Save as PDF).
 */
export async function ProposalDocument({
  proposal,
  locale,
}: {
  proposal: Proposal;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: 'Proposals' });
  const money = (cents: number) => formatMoney(cents, proposal.currency, locale);

  return (
    <article className={styles.document} aria-labelledby="proposal-title">
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo />
        </div>
        <dl className={styles.meta}>
          <div>
            <dt>{t('number')}</dt>
            <dd>#{proposal.number}</dd>
          </div>
          <div>
            <dt>{t('preparedFor')}</dt>
            <dd>{proposal.client.name}</dd>
          </div>
          <div>
            <dt>{t('date')}</dt>
            <dd>{formatDate(proposal.sentAt ?? proposal.createdAt, locale)}</dd>
          </div>
          {proposal.validUntil ? (
            <div>
              <dt>{t('validUntil')}</dt>
              <dd>{formatDate(proposal.validUntil, locale)}</dd>
            </div>
          ) : null}
          {proposal.project ? (
            <div>
              <dt>{t('project')}</dt>
              <dd>{proposal.project.name}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <h2 id="proposal-title" className={styles.title}>
        {proposal.title}
      </h2>

      <section className={styles.section}>
        <Markdown compact>{proposal.summary}</Markdown>
      </section>

      <section className={styles.section} aria-labelledby="proposal-items">
        <h3 id="proposal-items" className={styles.sectionTitle}>
          {t('items')}
        </h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('description')}</th>
                <th scope="col" className={`${styles.num} ${styles.wide}`}>
                  {t('quantity')}
                </th>
                <th scope="col" className={`${styles.num} ${styles.wide}`}>
                  {t('unitPrice')}
                </th>
                <th scope="col" className={styles.num}>
                  {t('amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {proposal.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.description}
                    {/* Phones drop the quantity and price columns: they go under the item. */}
                    <span className={styles.narrowLine}>
                      {item.quantity} × {money(item.unitPrice)}
                    </span>
                  </td>
                  <td className={`${styles.num} ${styles.wide}`}>{item.quantity}</td>
                  <td className={`${styles.num} ${styles.wide}`}>{money(item.unitPrice)}</td>
                  <td className={styles.num}>{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className={styles.wide} aria-hidden="true" />
                <th scope="row">{t('total')}</th>
                <td className={`${styles.num} ${styles.total}`}>{money(proposal.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {proposal.terms ? (
        <section className={styles.section} aria-labelledby="proposal-terms">
          <h3 id="proposal-terms" className={styles.sectionTitle}>
            {t('terms')}
          </h3>
          <Markdown compact>{proposal.terms}</Markdown>
        </section>
      ) : null}

      {proposal.status === 'ACCEPTED' && proposal.respondedAt ? (
        <p className={styles.signature}>
          {t('acceptedBy', {
            name: proposal.acceptedName ?? proposal.client.name,
            date: formatDate(proposal.respondedAt, locale),
          })}
        </p>
      ) : null}
    </article>
  );
}
