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

/** What changed between two versions of the whole content, for the team's email. */
export function changedSections(before: SiteContent, after: SiteContent): string[] {
  const labels: Record<keyof SiteContent, string> = {
    business: 'Business',
    theme: 'Design',
    contact: 'Contact',
    hours: 'Opening hours',
    openingHoursSpec: 'Opening hours (for Google)',
    social: 'Social links',
    hero: 'Header',
    services: 'Services',
    about: 'About',
    gallery: 'Gallery',
    testimonials: 'Reviews',
    sections: 'Section order',
    navLabels: 'Menu',
    banner: 'Banner',
    notices: 'Notices',
    contactSection: 'Contact section',
    legal: 'Legal data',
    footerNote: 'Footer note',
  };
  return (Object.keys(labels) as Array<keyof SiteContent>)
    .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map((key) => labels[key]);
}

/** Whether a photo is one the client uploaded (it doesn't belong to any style). */
const uploaded = (image: { file: string } | undefined) => image?.file.startsWith('media/') ?? false;

/**
 * The content in another style (`preset`: that style's demo content): its colours, fonts,
 * corners and section order, and its photos where the client hasn't uploaded their own. Every
 * text stays.
 */
export function applyStyle(content: SiteContent, preset: SiteContent): SiteContent {
  const ownPhotos = content.gallery?.images.filter(uploaded) ?? [];
  return {
    ...content,
    theme: preset.theme,
    sections: preset.sections,
    hero: {
      ...content.hero,
      image: uploaded(content.hero.image) ? content.hero.image : preset.hero.image,
    },
    about: content.about
      ? {
          ...content.about,
          image: uploaded(content.about.image) ? content.about.image : preset.about?.image,
        }
      : undefined,
    gallery: content.gallery
      ? {
          ...content.gallery,
          images:
            ownPhotos.length > 0 ? ownPhotos : (preset.gallery?.images ?? content.gallery.images),
        }
      : undefined,
  };
}
