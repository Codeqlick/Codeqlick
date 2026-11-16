/**
 * The anchor of the privacy policy's section on status page subscribers, in each language: the
 * status pages' sign-up links to it (decision 105). A test keeps it in step with the heading. Its
 * own module so the sign-up form doesn't bundle the legal texts.
 */
export const STATUS_SUBSCRIBERS_ANCHOR = {
  es: 'suscriptores-de-paginas-de-estado',
  en: 'status-page-subscribers',
} as const;

/** The terms of sale's section on the managed sites' maintenance plan (decision 110). */
export const MAINTENANCE_TERMS_ANCHOR = {
  es: 'plan-de-mantenimiento',
  en: 'maintenance-plan',
} as const;
