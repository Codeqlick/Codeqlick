import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://restaurante.demo.codeqlick.com',
  business: {
    name: 'Casa Lola',
    tagline: 'Arrocería · Valencia',
    description:
      'Arrocería en el Cabanyal (Valencia): paella valenciana a leña, arroces del día y tapas de mercado. Reserva tu mesa por teléfono o WhatsApp.',
    schemaType: 'Restaurant',
    priceRange: '€€',
  },
  theme: {
    primary: '#2F5D3A',
    primaryText: '#FFFFFF',
    background: '#FAF6EE',
    surface: '#F1E8D8',
    text: '#1F1A14',
    muted: '#62584B',
    headingFont: 'fraunces',
    bodyFont: 'inter',
    corners: 'soft',
  },
  contact: {
    phone: '963 00 00 00',
    whatsapp: '34600000000',
    email: 'reservas@casalola.example',
    address: {
      street: 'Carrer de la Reina 120',
      postalCode: '46011',
      city: 'Valencia',
      region: 'Comunitat Valenciana',
    },
  },
  hours: [
    { days: 'Lunes y martes', hours: 'Cerrado' },
    { days: 'Miércoles a viernes', hours: '13:00–16:00 · 20:30–23:30' },
    { days: 'Sábado y domingo', hours: '13:00–16:30' },
  ],
  openingHoursSpec: ['We-Fr 13:00-16:00', 'We-Fr 20:30-23:30', 'Sa-Su 13:00-16:30'],
  social: { instagram: 'https://instagram.com' },
  form: { demo: true },
  hero: {
    eyebrow: 'Arrocería en el Cabanyal',
    title: 'Paella a leña, como la hacía la abuela Lola',
    text: 'Arroz de la Albufera, producto del Mercat del Cabanyal y fuego de naranjo. Ven con hambre y sin prisa: aquí la sobremesa también cuenta.',
    image: { file: 'hero.jpg', alt: 'Mesa de restaurante servida con platos y copas de vino' },
    primary: { label: 'Reservar mesa', href: '#contacto' },
    secondary: { label: 'Ver la carta', href: '#servicios' },
    facts: [
      { value: 'Desde 1987', label: 'en el barrio' },
      { value: 'Leña', label: 'de naranjo' },
      { value: '60', label: 'comensales' },
    ],
  },
  services: {
    title: 'Nuestra carta',
    intro: 'Los arroces son para dos personas como mínimo. Precio por persona.',
    items: [
      {
        name: 'Paella valenciana',
        description: 'Pollo, conejo, garrofó y bajoqueta. La de siempre.',
        price: '17 €',
      },
      {
        name: 'Arroz del senyoret',
        description: 'Marisco pelado, para comer sin mancharse.',
        price: '19 €',
      },
      { name: 'Arroz negro', description: 'Con sepia y alioli casero.', price: '18 €' },
      { name: 'Esgarraet', description: 'Pimiento asado, bacalao y ajo.', price: '9 €' },
      {
        name: 'Clóchinas al vapor',
        description: 'De mayo a agosto, de la bahía de Valencia.',
        price: '12 €',
      },
      { name: 'Tarta de la casa', description: 'De queso, al horno, cada mañana.', price: '6 €' },
    ],
    note: 'Menú del día de miércoles a viernes a mediodía: 16 € con bebida y postre.',
  },
  about: {
    title: 'Tres generaciones alrededor del fuego',
    paragraphs: [
      'Lola abrió la casa en 1987 en una antigua barraca del Cabanyal. Hoy la cocina la llevan su hija y su nieto, con las mismas paelleras y la misma leña.',
      'Compramos cada mañana en el mercado del barrio y cocinamos cada arroz al momento: por eso te pedimos 25 minutos de paciencia.',
    ],
    image: { file: 'about.jpg', alt: 'Cocina del restaurante con el equipo trabajando' },
    highlights: ['Arroz D.O. Valencia', 'Terraza a dos calles de la playa', 'Opciones sin gluten'],
  },
  gallery: {
    title: 'De la cocina a tu mesa',
    images: [
      { file: 'galeria-2.jpg', alt: 'Paella de marisco cocinándose sobre el fuego' },
      { file: 'galeria-1.jpg', alt: 'Camarero sirviendo tapas en la sala' },
      { file: 'galeria-3.jpg', alt: 'Mesa de madera preparada para la cena' },
      { file: 'galeria-4.jpg', alt: 'Amigos compartiendo platos en una mesa' },
      { file: 'galeria-5.jpg', alt: 'Paella con gambas recién hecha' },
      { file: 'galeria-6.jpg', alt: 'Barra del restaurante con botellas de vino' },
    ],
  },
  testimonials: {
    title: 'Quien viene, repite',
    items: [
      {
        quote: 'La mejor paella que he comido fuera de casa de mi madre. Y eso es mucho decir.',
        author: 'Vicent P.',
        detail: 'Valencia',
      },
      {
        quote:
          'Celebramos el cumpleaños de mi padre y nos trataron como de la familia. El arroz negro, espectacular.',
        author: 'Marta S.',
      },
      {
        quote: 'Reservamos por WhatsApp en un minuto. Terraza preciosa y precio justo.',
        author: 'Jordi y Anna',
        detail: 'Barcelona',
      },
    ],
  },
  banner: {
    title: '¿Mesa para este fin de semana?',
    text: 'Los domingos se llena: reserva con unos días de antelación.',
    link: { label: 'Reservar mesa', href: '#contacto' },
  },
  contactSection: {
    title: 'Reserva tu mesa',
    intro:
      'Llámanos o escríbenos por WhatsApp. Para grupos de más de 10, mejor con una semana de margen.',
  },
  legal: {
    owner: 'Casa Lola (negocio ficticio)',
    taxId: '00000000T',
    address: 'Carrer de la Reina 120, 46011 Valencia',
    email: 'reservas@casalola.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: el restaurante, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
