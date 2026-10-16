import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://general.demo.codeqlick.com',
  business: {
    name: 'Brezo',
    tagline: 'Tienda y taller · Oviedo',
    description:
      'Brezo, tienda y taller en Oviedo: productos hechos a mano, talleres en grupo y encargos a medida.',
    schemaType: 'LocalBusiness',
    priceRange: '€€',
  },
  theme: {
    primary: '#3D4B5C',
    primaryText: '#FFFFFF',
    background: '#FAFAF9',
    surface: '#EFEFEC',
    text: '#1A1D21',
    muted: '#585E66',
    headingFont: 'inter',
    bodyFont: 'inter',
    corners: 'soft',
  },
  contact: {
    phone: '985 00 00 00',
    whatsapp: '34600000000',
    email: 'hola@brezo.example',
    address: {
      street: 'Calle Gascona 5',
      postalCode: '33001',
      city: 'Oviedo',
      region: 'Asturias',
    },
  },
  hours: [
    { days: 'Martes a sábado', hours: '10:30–14:00 y 17:00–20:00' },
    { days: 'Domingo y lunes', hours: 'Cerrado' },
  ],
  openingHoursSpec: ['Tu-Sa 10:30-14:00', 'Tu-Sa 17:00-20:00'],
  social: { instagram: 'https://instagram.com' },
  form: { demo: true },
  hero: {
    eyebrow: 'Tienda y taller en Oviedo',
    title: 'Cosas bien hechas, cerca de casa',
    text: 'Productos hechos a mano, talleres para aprender a hacerlos y encargos a tu medida. Pásate a vernos o escríbenos.',
    image: { file: 'hero.jpg', alt: 'Cartel de «Open» colgado en el escaparate de una tienda' },
    primary: { label: 'Escríbenos', href: '#contacto' },
    secondary: { label: 'Qué hacemos', href: '#servicios' },
    facts: [
      { value: 'Hecho', label: 'a mano' },
      { value: 'Talleres', label: 'cada semana' },
      { value: 'Encargos', label: 'a medida' },
    ],
  },
  services: {
    title: 'Qué hacemos',
    items: [
      { name: 'Tienda', description: 'Piezas hechas en el taller y de artesanos de la zona.' },
      {
        name: 'Talleres',
        description: 'Grupos de seis personas, todo el material incluido.',
        price: 'desde 35 €',
      },
      {
        name: 'Encargos',
        description: 'Regalos de empresa, bodas y piezas personalizadas.',
        price: 'a medida',
      },
      {
        name: 'Tarjeta regalo',
        description: 'Para la tienda o para un taller.',
        price: 'desde 20 €',
      },
    ],
  },
  about: {
    title: 'Quiénes somos',
    paragraphs: [
      'Brezo empezó como un taller en casa y hoy es una pequeña tienda en el centro de Oviedo. Hacemos casi todo lo que vendemos, y lo que no, lo elegimos de gente que conocemos.',
      'Nos gusta explicar cómo se hacen las cosas: por eso abrimos el taller a quien quiera aprender.',
    ],
    image: { file: 'about.jpg', alt: 'Mujer trabajando con un portátil en una mesa con plantas' },
    highlights: ['Atención cercana', 'Envíos a toda España', 'Pago con tarjeta o Bizum'],
  },
  gallery: {
    title: 'Así es Brezo',
    images: [
      { file: 'galeria-1.jpg', alt: 'Interior de una tienda con mostrador y estanterías' },
      { file: 'galeria-2.jpg', alt: 'Manos dibujando bocetos sobre una mesa de madera' },
      { file: 'galeria-3.jpg', alt: 'Hombre trabajando en un taller' },
      { file: 'galeria-4.jpg', alt: 'Planta en maceta junto a unos libros sobre una mesa' },
      { file: 'galeria-5.jpg', alt: 'Pinturas y pinceles sobre una mesa de trabajo' },
      { file: 'galeria-6.jpg', alt: 'Gente sentada en un local luminoso con lámparas colgantes' },
    ],
  },
  testimonials: {
    title: 'Lo que nos dicen',
    items: [
      {
        quote: 'Fui a un taller con mi hermana y salimos con ganas de apuntarnos al siguiente.',
        author: 'Paula F.',
      },
      {
        quote: 'Les encargamos los regalos de la empresa y quedaron todos encantados.',
        author: 'Iván R.',
      },
      {
        quote: 'Una tienda con cosas que no encuentras en otro sitio, y gente muy maja.',
        author: 'Marina L.',
      },
    ],
  },
  contactSection: {
    title: 'Escríbenos',
    intro: 'Pregúntanos por un producto, un taller o un encargo. Te respondemos en un día.',
  },
  legal: {
    owner: 'Brezo (negocio ficticio)',
    taxId: '00000000T',
    address: 'Calle Gascona 5, 33001 Oviedo',
    email: 'hola@brezo.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: el negocio, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
