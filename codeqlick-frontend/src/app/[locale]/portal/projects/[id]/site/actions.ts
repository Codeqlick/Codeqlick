'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { getMySite, saveMySite, setMySiteDomain, uploadMySitePhoto } from '@/lib/api/portal-site';
import type { EditableSite } from '@/lib/api/types';
import { formValues, type FormState } from '@/lib/forms';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The trimmed text of a field, or undefined when empty. */
function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Rows posted by RowsField (`<name>.<column>` per row), empty rows dropped. */
function rows<K extends string>(formData: FormData, name: string, keys: readonly K[]) {
  const columns = keys.map((key) =>
    formData
      .getAll(`${name}.${key}`)
      .map((value) => (typeof value === 'string' ? value.trim() : '')),
  );
  return (columns[0] ?? [])
    .map((_, index) =>
      Object.fromEntries(keys.map((key, ci) => [key, columns[ci]?.[index] || undefined])),
    )
    .filter((item) => Object.values(item).some(Boolean)) as Array<Record<K, string | undefined>>;
}

/** "600 11 22 33" → "34600112233" (Spanish numbers get the country code). */
function whatsappNumber(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.length === 9 ? `34${digits}` : digits;
}

export async function saveSiteAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'PortalSite' });
  const values = formValues(formData);
  let current: EditableSite;
  try {
    current = (await getMySite(projectId)).editable;
  } catch (error) {
    return failedState(error, locale, formData);
  }

  // A new photo goes in first: the gallery then refers to it.
  const images = rows(formData, 'gallery', ['file', 'alt'] as const)
    .filter((image) => image.file && !formData.getAll('gallery.remove').includes(image.file))
    .map((image) => ({ file: image.file!, alt: image.alt ?? '' }));
  const photo = formData.get('newPhoto');
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return { status: 'error', fieldErrors: { newPhoto: t('photoTooLarge') }, values };
    }
    const alt = text(formData, 'newPhotoAlt');
    if (!alt) return { status: 'error', fieldErrors: { newPhotoAlt: t('altRequired') }, values };
    try {
      images.push({ file: (await uploadMySitePhoto(projectId, photo)).file, alt });
    } catch (error) {
      return failedState(error, locale, formData, () => 'newPhoto');
    }
  }
  if (images.some((image) => !image.alt)) {
    return { status: 'error', message: t('altRequired'), values };
  }

  const street = text(formData, 'street');
  const services = rows(formData, 'services', ['name', 'description', 'price'] as const);
  const reviews = rows(formData, 'reviews', ['quote', 'author', 'detail'] as const);
  const hours = rows(formData, 'hours', ['days', 'hours'] as const);
  const paragraphs = (text(formData, 'aboutText') ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const site: EditableSite = {
    tagline: text(formData, 'tagline'),
    contact: {
      phone: text(formData, 'phone'),
      whatsapp: whatsappNumber(text(formData, 'whatsapp')),
      email: text(formData, 'email'),
      address: street
        ? {
            street,
            postalCode: text(formData, 'postalCode') ?? '',
            city: text(formData, 'city') ?? '',
            region: text(formData, 'region') ?? '',
          }
        : undefined,
      mapsUrl: current.contact.mapsUrl,
    },
    hours:
      hours.length > 0
        ? hours.map((h) => ({ days: h.days ?? '', hours: h.hours ?? '' }))
        : undefined,
    hero: { title: text(formData, 'heroTitle') ?? '', text: text(formData, 'heroText') ?? '' },
    services:
      services.length > 0
        ? {
            title: text(formData, 'servicesTitle') ?? t('defaultServicesTitle'),
            intro: text(formData, 'servicesIntro'),
            items: services.map((s) => ({
              name: s.name ?? '',
              description: s.description,
              price: s.price,
            })),
            note: text(formData, 'servicesNote'),
          }
        : undefined,
    about:
      paragraphs.length > 0
        ? { title: text(formData, 'aboutTitle') ?? t('defaultAboutTitle'), paragraphs }
        : undefined,
    gallery:
      images.length > 0
        ? {
            title: text(formData, 'galleryTitle') ?? t('defaultGalleryTitle'),
            intro: current.gallery?.intro,
            images,
          }
        : undefined,
    testimonials:
      reviews.length > 0
        ? {
            title: text(formData, 'reviewsTitle') ?? t('defaultReviewsTitle'),
            items: reviews.map((r) => ({
              quote: r.quote ?? '',
              author: r.author ?? '',
              detail: r.detail,
            })),
          }
        : undefined,
  };

  try {
    const saved = await saveMySite(projectId, site);
    revalidatePath(`/${locale}/portal`, 'layout');
    return saved.status === 'FAILED'
      ? { status: 'error', message: t('publishFailed') }
      : { status: 'success', message: t('published') };
  } catch (error) {
    // The API names the field in its message ("site.hero.title: …").
    return failedState(error, locale, formData);
  }
}

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The client chooses, changes or (empty) drops their own domain. */
export async function setSiteDomainAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'PortalSite' });
  const values = formValues(formData);
  const raw =
    text(formData, 'domainName')
      ?.toLowerCase()
      .replace(/^www\./, '') ?? null;
  if (raw && !DOMAIN.test(raw)) {
    return { status: 'error', fieldErrors: { domainName: t('domainInvalid') }, values };
  }
  try {
    await setMySiteDomain(projectId, raw);
  } catch (error) {
    if (isApiError(error) && (error.status === 409 || error.status === 400)) {
      const message = error.status === 409 ? t('domainInUse') : t('domainReserved');
      return { status: 'error', fieldErrors: { domainName: message }, values };
    }
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/portal`, 'layout');
  return { status: 'success', message: raw ? t('domainSaved') : t('domainRemoved') };
}
