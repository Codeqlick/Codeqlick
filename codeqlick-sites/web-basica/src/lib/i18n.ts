import type { Allergen, SectionKey } from '../types';

/** Spanish is the main language; English pages are built under `/en` (architecture 8.2). */
export type Lang = 'es' | 'en';

interface Words {
  /** `<html lang>`, `og:locale`, dates and the feed's language. */
  htmlLang: string;
  ogLocale: string;
  dateLocale: string;
  feedLang: string;
  /** The switcher's link to this language, written in it. */
  name: string;
  skip: string;
  sections: Record<SectionKey, string>;
  news: string;
  contact: string;
  menu: string;
  mainNav: string;
  mobileNav: string;
  menuButton: string;
  call: string;
  language: string;
  followUs: string;
  legalNotice: string;
  privacy: string;
  cookies: string;
  madeBy: string;
  codeqlick: string;
  bookOnline: string;
  bookOnlineText: string;
  address: string;
  directions: string;
  phone: string;
  writeUs: string;
  email: string;
  hours: string;
  formName: string;
  formPhone: string;
  formEmail: string;
  formMessage: string;
  formHoneypot: string;
  formPrivacyBefore: string;
  formPrivacyLink: string;
  formSend: string;
  formOk: string;
  formError: string;
  formDemo: string;
  reviewOnGoogle: string;
  seeMenu: string;
  latestNews: string;
  allNewsHome: string;
  allNews: string;
  newsTitle: (business: string) => string;
  newsDescription: (business: string) => string;
  newsPage: (page: number) => string;
  newsPages: string;
  newer: string;
  older: string;
  pageOf: (page: number, count: number) => string;
  categories: string;
  allergens: string;
  allergyNote: string;
  allergenNames: Record<Allergen, string>;
  whatsappText: string;
  whatsappLabel: string;
}

export const ui: Record<Lang, Words> = {
  es: {
    htmlLang: 'es',
    ogLocale: 'es_ES',
    dateLocale: 'es-ES',
    feedLang: 'es-ES',
    name: 'Español',
    skip: 'Saltar al contenido',
    sections: {
      services: 'Servicios',
      about: 'Sobre nosotros',
      gallery: 'Galería',
      testimonials: 'Opiniones',
    },
    news: 'Noticias',
    contact: 'Contacto',
    menu: 'Carta',
    mainNav: 'Principal',
    mobileNav: 'Principal (móvil)',
    menuButton: 'Menú',
    call: 'Llamar',
    language: 'Idioma',
    followUs: 'Síguenos',
    legalNotice: 'Aviso legal',
    privacy: 'Privacidad',
    cookies: 'Cookies',
    madeBy: 'Web creada por',
    codeqlick: 'https://codeqlick.com/es',
    bookOnline: 'Reserva online',
    bookOnlineText: 'Elige día y hora; te llega la confirmación por email.',
    address: 'Dirección',
    directions: 'Cómo llegar',
    phone: 'Teléfono',
    writeUs: 'Escríbenos',
    email: 'Email',
    hours: 'Horario',
    formName: 'Nombre',
    formPhone: 'Teléfono (opcional)',
    formEmail: 'Email',
    formMessage: 'Mensaje',
    formHoneypot: 'No rellenes este campo',
    formPrivacyBefore: 'He leído y acepto la',
    formPrivacyLink: 'política de privacidad',
    formSend: 'Enviar mensaje',
    formOk: 'Gracias, hemos recibido tu mensaje. Te responderemos lo antes posible.',
    formError: 'No se ha podido enviar. Revisa los campos y vuelve a intentarlo.',
    formDemo: 'Esta web es una demostración: el formulario no envía mensajes.',
    reviewOnGoogle: 'Déjanos tu opinión en Google',
    seeMenu: 'Ver la carta',
    latestNews: 'Novedades',
    allNewsHome: 'Ver todas las noticias',
    allNews: 'Todas las noticias',
    newsTitle: (business) => `Noticias de ${business}`,
    newsDescription: (business) => `Novedades y ofertas de ${business}.`,
    newsPage: (page) => `Noticias, página ${page}`,
    newsPages: 'Páginas de noticias',
    newer: 'Más recientes',
    older: 'Más antiguas',
    pageOf: (page, count) => `Página ${page} de ${count}`,
    categories: 'Categorías',
    allergens: 'Alérgenos:',
    allergyNote:
      'Si tienes alguna alergia o intolerancia, pregúntanos: te informamos de los alérgenos de cada plato.',
    // In the order of the regulation, with the names diners know them by.
    allergenNames: {
      gluten: 'Gluten',
      crustaceans: 'Crustáceos',
      eggs: 'Huevo',
      fish: 'Pescado',
      peanuts: 'Cacahuetes',
      soybeans: 'Soja',
      milk: 'Lácteos',
      nuts: 'Frutos de cáscara',
      celery: 'Apio',
      mustard: 'Mostaza',
      sesame: 'Sésamo',
      sulphites: 'Sulfitos',
      lupin: 'Altramuces',
      molluscs: 'Moluscos',
    },
    whatsappText: 'Hola, os escribo desde vuestra web.',
    whatsappLabel: 'Escríbenos por WhatsApp',
  },
  en: {
    htmlLang: 'en',
    ogLocale: 'en_GB',
    dateLocale: 'en-GB',
    feedLang: 'en',
    name: 'English',
    skip: 'Skip to content',
    sections: {
      services: 'Services',
      about: 'About us',
      gallery: 'Gallery',
      testimonials: 'Reviews',
    },
    news: 'News',
    contact: 'Contact',
    menu: 'Menu',
    mainNav: 'Main',
    mobileNav: 'Main (mobile)',
    menuButton: 'Menu',
    call: 'Call',
    language: 'Language',
    followUs: 'Follow us',
    legalNotice: 'Legal notice',
    privacy: 'Privacy',
    cookies: 'Cookies',
    madeBy: 'Website by',
    codeqlick: 'https://codeqlick.com/en',
    bookOnline: 'Book online',
    bookOnlineText: 'Pick a day and time; the confirmation reaches you by email.',
    address: 'Address',
    directions: 'Get directions',
    phone: 'Phone',
    writeUs: 'Message us',
    email: 'Email',
    hours: 'Opening hours',
    formName: 'Name',
    formPhone: 'Phone (optional)',
    formEmail: 'Email',
    formMessage: 'Message',
    formHoneypot: 'Leave this field empty',
    formPrivacyBefore: 'I have read and accept the',
    formPrivacyLink: 'privacy policy',
    formSend: 'Send message',
    formOk: 'Thank you, we have received your message. We will answer as soon as we can.',
    formError: 'It could not be sent. Check the fields and try again.',
    formDemo: 'This website is a demo: the form does not send messages.',
    reviewOnGoogle: 'Review us on Google',
    seeMenu: 'See the menu',
    latestNews: 'Latest news',
    allNewsHome: 'See all news',
    allNews: 'All news',
    newsTitle: (business) => `News from ${business}`,
    newsDescription: (business) => `News and offers from ${business}.`,
    newsPage: (page) => `News, page ${page}`,
    newsPages: 'News pages',
    newer: 'Newer',
    older: 'Older',
    pageOf: (page, count) => `Page ${page} of ${count}`,
    categories: 'Categories',
    allergens: 'Allergens:',
    allergyNote:
      'If you have any allergy or intolerance, please ask us: we will tell you the allergens in each dish.',
    allergenNames: {
      gluten: 'Gluten',
      crustaceans: 'Crustaceans',
      eggs: 'Eggs',
      fish: 'Fish',
      peanuts: 'Peanuts',
      soybeans: 'Soya',
      milk: 'Milk',
      nuts: 'Nuts',
      celery: 'Celery',
      mustard: 'Mustard',
      sesame: 'Sesame',
      sulphites: 'Sulphites',
      lupin: 'Lupin',
      molluscs: 'Molluscs',
    },
    whatsappText: "Hello, I'm writing from your website.",
    whatsappLabel: 'Message us on WhatsApp',
  },
};
