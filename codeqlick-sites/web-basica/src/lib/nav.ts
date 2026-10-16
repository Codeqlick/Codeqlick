import { site } from './site';

/** Header links: one per section the site has. */
export const nav = [
  site.services ? { label: 'Servicios', href: '/#servicios' } : null,
  site.about ? { label: 'Sobre nosotros', href: '/#nosotros' } : null,
  site.gallery ? { label: 'Galería', href: '/#galeria' } : null,
  site.testimonials ? { label: 'Opiniones', href: '/#opiniones' } : null,
  { label: 'Contacto', href: '/#contacto' },
].filter((link) => link !== null);
