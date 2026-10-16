import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://portfolio.demo.codeqlick.com',
  business: {
    name: 'Nora Vidal',
    tagline: 'Fotografía · Bilbao',
    description:
      'Nora Vidal, fotógrafa en Bilbao: bodas, retratos y paisaje. Reportajes naturales, sin poses forzadas, con las fotos editadas en dos semanas.',
    schemaType: 'ProfessionalService',
    priceRange: '€€',
  },
  theme: {
    primary: '#2B2A33',
    primaryText: '#FFFFFF',
    background: '#FAF8F5',
    surface: '#F0ECE6',
    text: '#1C1B21',
    muted: '#5E5A63',
    headingFont: 'fraunces',
    bodyFont: 'inter',
    corners: 'square',
  },
  contact: {
    phone: '944 00 00 00',
    whatsapp: '34600000000',
    email: 'hola@noravidal.example',
    address: {
      street: 'Calle Somera 14',
      postalCode: '48005',
      city: 'Bilbao',
      region: 'Bizkaia',
    },
  },
  social: { instagram: 'https://instagram.com' },
  form: { demo: true },
  sections: ['gallery', 'services', 'about', 'testimonials'],
  navLabels: { gallery: 'Trabajos', services: 'Sesiones', about: 'Sobre mí' },
  hero: {
    eyebrow: 'Fotografía en Bilbao',
    title: 'Fotos que cuentan cómo fue, no cómo posasteis',
    text: 'Bodas, retratos y paisaje con luz natural. Te acompaño sin dirigir cada gesto y te entrego las fotos editadas en dos semanas.',
    image: { file: 'hero.jpg', alt: 'Fotógrafa con chubasquero mirando por el visor de su cámara' },
    primary: { label: 'Pedir presupuesto', href: '#contacto' },
    secondary: { label: 'Ver trabajos', href: '#galeria' },
    facts: [
      { value: '+120', label: 'bodas' },
      { value: '2 semanas', label: 'de entrega' },
      { value: 'Galería', label: 'online privada' },
    ],
  },
  gallery: {
    title: 'Trabajos',
    intro: 'Una selección de bodas, retratos y viajes de los últimos años.',
    images: [
      { file: 'galeria-1.jpg', alt: 'Novios poniéndose los anillos' },
      { file: 'galeria-2.jpg', alt: 'Pareja sentada junto a un lago al atardecer' },
      { file: 'galeria-3.jpg', alt: 'Fiordo entre montañas visto desde lo alto' },
      { file: 'galeria-4.jpg', alt: 'Montaña nevada reflejada en un lago' },
      { file: 'galeria-5.jpg', alt: 'Invitados lanzando confeti a los novios en una escalinata' },
      { file: 'galeria-6.jpg', alt: 'Valle verde con un río entre montañas' },
    ],
  },
  services: {
    title: 'Sesiones',
    intro:
      'Cada reportaje incluye la edición de todas las fotos y una galería online para compartir.',
    items: [
      {
        name: 'Boda completa',
        description: 'Desde los preparativos hasta el baile. Unas 600 fotos.',
        price: 'desde 1.400 €',
      },
      {
        name: 'Ceremonia y banquete',
        description: 'Seis horas de cobertura.',
        price: 'desde 950 €',
      },
      {
        name: 'Preboda o pareja',
        description: 'Una hora en el sitio que elijáis.',
        price: '180 €',
      },
      { name: 'Retrato', description: 'Para tu perfil, tu web o tu familia.', price: '120 €' },
      { name: 'Copias y álbum', description: 'Álbum de lino de 30 páginas.', price: '+250 €' },
    ],
    note: 'Desplazamiento incluido en Bizkaia. Fuera, lo vemos según la distancia.',
  },
  about: {
    title: 'Hola, soy Nora',
    paragraphs: [
      'Llevo diez años haciendo fotos de bodas y retratos en Bilbao y alrededores. Empecé por los paisajes y de ellos me quedó la paciencia: esperar a que pase algo en vez de forzarlo.',
      'Antes de cada sesión nos tomamos un café para conocernos. El día de la foto, casi ni notaréis que estoy.',
    ],
    image: { file: 'about.jpg', alt: 'Manos sujetando fotografías impresas sobre una mesa' },
    highlights: ['Luz natural', 'Galería privada online', 'Fotos editadas en dos semanas'],
  },
  testimonials: {
    title: 'Lo que dicen',
    items: [
      {
        quote:
          'Las fotos de nuestra boda son exactamente como recordamos el día. Ni una pose rara.',
        author: 'Ane y Mikel',
        detail: 'Boda en Getxo',
      },
      {
        quote:
          'Me hizo unos retratos para mi web en una hora y me sentí cómoda desde el primer minuto.',
        author: 'Leire G.',
      },
      {
        quote: 'Rápida, cercana y con un ojo increíble. Repetiremos para el bautizo.',
        author: 'Jon A.',
      },
    ],
  },
  banner: {
    title: '¿Tienes ya la fecha?',
    text: 'Las fechas de primavera y verano vuelan. Escríbeme y te digo si estoy libre.',
    link: { label: 'Consultar fecha', href: '#contacto' },
  },
  contactSection: {
    title: 'Hablemos de tu sesión',
    intro: 'Cuéntame qué tienes en mente y la fecha. Te respondo en un día.',
  },
  legal: {
    owner: 'Nora Vidal (negocio ficticio)',
    taxId: '00000000T',
    address: 'Calle Somera 14, 48005 Bilbao',
    email: 'hola@noravidal.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: la fotógrafa, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
