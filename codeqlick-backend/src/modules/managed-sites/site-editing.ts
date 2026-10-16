import type { EditableSite, SiteContent } from './managed-sites.schemas.js';

/** The part of a site's content its client edits from the portal. */
export function editableOf(content: SiteContent): EditableSite {
  return {
    tagline: content.business.tagline,
    contact: content.contact,
    hours: content.hours,
    hero: { title: content.hero.title, text: content.hero.text },
    services: content.services,
    about: content.about
      ? { title: content.about.title, paragraphs: content.about.paragraphs }
      : undefined,
    gallery: content.gallery,
    testimonials: content.testimonials,
  };
}

/**
 * The content with the client's edits in. Hours written by hand no longer match the
 * machine-readable opening hours, so those are dropped when the hours change.
 */
export function applyEdits(content: SiteContent, edits: EditableSite): SiteContent {
  const hoursChanged =
    JSON.stringify(edits.hours ?? null) !== JSON.stringify(content.hours ?? null);
  const next: SiteContent = {
    ...content,
    business: { ...content.business, tagline: edits.tagline || undefined },
    contact: edits.contact,
    hours: edits.hours,
    hero: { ...content.hero, title: edits.hero.title, text: edits.hero.text },
    services: edits.services,
    about: edits.about
      ? { ...content.about, title: edits.about.title, paragraphs: edits.about.paragraphs }
      : undefined,
    gallery: edits.gallery,
    testimonials: edits.testimonials,
  };
  if (hoursChanged) delete next.openingHoursSpec;
  return next;
}

/** Plain-text list of what changed, for the team's email ("Horario", "Servicios"…). */
export function changedParts(before: EditableSite, after: EditableSite): string[] {
  const labels: Record<keyof EditableSite, string> = {
    tagline: 'Subtitle',
    contact: 'Contact',
    hours: 'Opening hours',
    hero: 'Header',
    services: 'Services',
    about: 'About',
    gallery: 'Gallery',
    testimonials: 'Reviews',
  };
  return (Object.keys(labels) as Array<keyof EditableSite>)
    .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map((key) => labels[key]);
}
