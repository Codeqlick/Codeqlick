export const LANGS = ['en', 'es'] as const;
export type Lang = (typeof LANGS)[number];

/** Sidebar groups, in display order. */
export const GROUPS = ['start', 'hosting', 'services', 'reference'] as const;
export type Group = (typeof GROUPS)[number];

export const SITE_NAME = 'Codeqlick Cloud docs';

export const otherLang = (lang: Lang): Lang => (lang === 'en' ? 'es' : 'en');

interface Strings {
  htmlLang: string;
  ogLocale: string;
  /** The language switcher shows the other language's own name. */
  switchTo: string;
  switchLabel: string;
  skip: string;
  nav: string;
  menu: string;
  groups: Record<Group, string>;
  onThisPage: string;
  prev: string;
  next: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchEmpty: string;
  searchCount: string;
  copyAnchor: string;
  footer: string;
  homeLabel: string;
}

export const ui: Record<Lang, Strings> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    switchTo: 'Español',
    switchLabel: 'Leer esta página en español',
    skip: 'Skip to content',
    nav: 'Documentation',
    menu: 'Menu',
    groups: {
      start: 'Get started',
      hosting: 'Hosting',
      services: 'Services',
      reference: 'Reference',
    },
    onThisPage: 'On this page',
    prev: 'Previous',
    next: 'Next',
    searchLabel: 'Search the docs',
    searchPlaceholder: 'Search the docs',
    searchEmpty: 'No results',
    searchCount: '{n} results',
    copyAnchor: 'Link to this section',
    footer: 'Codeqlick Cloud documentation',
    homeLabel: 'codeqlick Docs, start page',
  },
  es: {
    htmlLang: 'es',
    ogLocale: 'es_ES',
    switchTo: 'English',
    switchLabel: 'Read this page in English',
    skip: 'Saltar al contenido',
    nav: 'Documentación',
    menu: 'Menú',
    groups: {
      start: 'Primeros pasos',
      hosting: 'Hosting',
      services: 'Servicios',
      reference: 'Referencia',
    },
    onThisPage: 'En esta página',
    prev: 'Anterior',
    next: 'Siguiente',
    searchLabel: 'Buscar en la documentación',
    searchPlaceholder: 'Buscar en la documentación',
    searchEmpty: 'Sin resultados',
    searchCount: '{n} resultados',
    copyAnchor: 'Enlace a esta sección',
    footer: 'Documentación de Codeqlick Cloud',
    homeLabel: 'codeqlick Docs, página de inicio',
  },
};
