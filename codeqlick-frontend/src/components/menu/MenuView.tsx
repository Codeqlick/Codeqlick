import type { ReactNode } from 'react';
import {
  allergenText,
  formatMenuPrice,
  menuLocale,
  visibleCategories,
  type MenuCategory,
  type MenuCurrency,
  type MenuKind,
  type MenuLabels,
  type MenuLanguage,
} from '@/lib/menu';
import styles from './MenuView.module.css';

export type MenuViewData = {
  kind: MenuKind;
  businessName: string;
  language: MenuLanguage;
  currency: MenuCurrency;
  title: string;
  intro: string;
  address: string;
  openingNote: string;
  note: string;
  showBadge: boolean;
  content: { categories: MenuCategory[] };
};

type MenuViewProps = {
  menu: MenuViewData;
  labels: MenuLabels;
  /** The language of the page's own words (the URL's locale): `lang` is set where it differs. */
  uiLocale: string;
  /** Where "Made with Codeqlick" goes. */
  badgeHref: string;
  /** The editor's preview: one heading level lower (the editor has its own H1) and no id clashes. */
  preview?: boolean;
  /** What the page adds below (the report link). */
  footer?: ReactNode;
};

/**
 * A menu page's content (architecture 4.20): the public page and the editor's preview render
 * this same component, so what the owner sees is what the page shows. Pure: no hooks, no client
 * code, no images. Hidden items and empty categories are left out here too.
 */
export function MenuView({ menu, labels, uiLocale, badgeHref, preview, footer }: MenuViewProps) {
  const lang = menuLocale(menu.language);
  const ui = uiLocale === lang ? undefined : uiLocale;
  const categories = visibleCategories(menu.content);
  const prefix = preview ? 'preview-' : '';
  const Top = preview ? 'h2' : 'h1';
  const Section = preview ? 'h3' : 'h2';
  const isMenu = menu.kind === 'MENU';

  return (
    <article className={styles.menu} lang={lang}>
      <header className={styles.header}>
        <Top className={styles.business}>{menu.businessName}</Top>
        <p className={styles.title}>{menu.title}</p>
        {menu.intro ? <p className={styles.intro}>{menu.intro}</p> : null}
        {menu.address || menu.openingNote ? (
          <ul className={styles.facts}>
            {menu.address ? (
              <li>
                <a
                  href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(menu.address)}`}
                  rel="noopener"
                >
                  {menu.address}
                </a>
              </li>
            ) : null}
            {menu.openingNote ? <li>{menu.openingNote}</li> : null}
          </ul>
        ) : null}
      </header>

      {categories.length > 1 ? (
        <nav aria-label={labels.jump} lang={ui} className={styles.jump}>
          <ul>
            {categories.map((category, index) => (
              <li key={category.key ?? index}>
                <a href={`#${prefix}c${index}`} lang={lang}>
                  {category.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {categories.map((category, index) => (
        <section
          key={category.key ?? index}
          className={styles.category}
          aria-labelledby={`${prefix}c${index}`}
        >
          <Section id={`${prefix}c${index}`} className={styles.categoryName}>
            {category.name}
          </Section>
          <ul className={styles.items}>
            {category.items.map((item, position) => {
              const contains = isMenu
                ? allergenText(item.allergens, labels.allergens, labels.contains, ui ?? lang)
                : '';
              const price = formatMenuPrice(item.price, menu.currency, menu.language);
              return (
                <li
                  key={item.key ?? position}
                  className={styles.item}
                  data-sold-out={item.soldOut ? '' : undefined}
                >
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>
                      {item.name}
                      {item.soldOut ? (
                        <span className={styles.soldOut} lang={ui}>
                          {' '}
                          {labels.soldOut}
                        </span>
                      ) : null}
                    </span>
                    {price ? <span className={styles.price}>{price}</span> : null}
                  </div>
                  {item.description ? (
                    <p className={styles.description}>{item.description}</p>
                  ) : null}
                  {contains ? (
                    <p className={styles.contains} lang={ui}>
                      {contains}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {menu.note ? <p className={styles.note}>{menu.note}</p> : null}
      {isMenu ? (
        <p className={styles.allergenNote} lang={ui}>
          {labels.allergenNote}
        </p>
      ) : null}
      {menu.showBadge ? (
        <p className={styles.badge} lang={ui}>
          <a href={badgeHref} rel="noopener">
            {labels.madeWith}
          </a>
        </p>
      ) : null}
      {footer}
    </article>
  );
}
