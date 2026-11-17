import { CITIES, LOCAL_SERVICES, type City, type LocalService } from '@/content/local-seo';
import { Link } from '@/i18n/navigation';
import type { SiteLocale } from '@/i18n/routing';
import styles from './services.module.css';

/** A titled list of links to local service pages (decision 121), as pills. */
function LinkList({
  id,
  title,
  lead,
  links,
}: {
  id: string;
  title: string;
  lead?: string;
  links: { href: string; label: string }[];
}) {
  return (
    <section className={styles.local} aria-labelledby={id}>
      <h2 id={id} className={styles.columnTitle}>
        {title}
      </h2>
      {lead ? <p className={styles.localLead}>{lead}</p> : null}
      <ul className={styles.pills}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={styles.pill}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The service in every city (but `except`): the hub's list and the "other cities" list. */
export function CityLinks({
  locale,
  service,
  except,
  id,
  title,
  lead,
}: {
  locale: SiteLocale;
  service: LocalService;
  except?: City;
  id: string;
  title: string;
  lead?: string;
}) {
  const links = CITIES.filter((city) => city !== except).map((city) => ({
    href: `/services/${service.slug}/${city.slug}`,
    label: city.name[locale],
  }));
  return <LinkList id={id} title={title} lead={lead} links={links} />;
}

/** The other local services in one city. */
export function ServiceLinks({
  locale,
  city,
  except,
  id,
  title,
}: {
  locale: SiteLocale;
  city: City;
  except: LocalService;
  id: string;
  title: string;
}) {
  const links = LOCAL_SERVICES.filter((service) => service !== except).map((service) => ({
    href: `/services/${service.slug}/${city.slug}`,
    label: service.name[locale],
  }));
  return <LinkList id={id} title={title} links={links} />;
}

/** The four hubs, for the services page. */
export function HubLinks({
  locale,
  title,
  lead,
}: {
  locale: SiteLocale;
  title: string;
  lead: string;
}) {
  const links = LOCAL_SERVICES.map((service) => ({
    href: `/services/${service.slug}`,
    label: service.name[locale],
  }));
  return <LinkList id="near-you-title" title={title} lead={lead} links={links} />;
}
