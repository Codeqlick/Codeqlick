import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://comercio.demo.codeqlick.com',
  business: {
    name: 'Flores Abril',
    tagline: 'Floristería · Granada',
    description:
      'Floristería en el Realejo (Granada): ramos del día, plantas, flores para eventos y entrega a domicilio en toda la ciudad.',
    schemaType: 'Florist',
    priceRange: '€',
  },
  theme: {
    primary: '#2F6B3B',
    primaryText: '#FFFFFF',
    background: '#FBF8F3',
    surface: '#F1EADF',
    text: '#22281F',
    muted: '#5A6153',
    headingFont: 'fraunces',
    bodyFont: 'outfit',
    corners: 'round',
  },
  contact: {
    phone: '958 00 00 00',
    whatsapp: '34600000000',
    email: 'pedidos@floresabril.example',
    address: {
      street: 'Calle Molinos 8',
      postalCode: '18009',
      city: 'Granada',
      region: 'Granada',
    },
  },
  hours: [
    { days: 'Lunes a viernes', hours: '9:30–14:00 y 17:00–20:30' },
    { days: 'Sábado', hours: '9:30–14:00' },
    { days: 'Domingo', hours: 'Cerrado' },
  ],
  openingHoursSpec: ['Mo-Fr 09:30-14:00', 'Mo-Fr 17:00-20:30', 'Sa 09:30-14:00'],
  social: { instagram: 'https://instagram.com' },
  form: { demo: true },
  navLabels: { services: 'Productos', about: 'La tienda' },
  hero: {
    eyebrow: 'Floristería en el Realejo',
    title: 'Flores frescas cada mañana, en tu puerta en dos horas',
    text: 'Ramos hechos al momento, plantas que duran y flores para tus celebraciones. Encárgalo por WhatsApp y te lo llevamos a casa.',
    image: {
      file: 'hero.jpg',
      alt: 'Cubos con ramos de flores de colores a la entrada de la tienda',
    },
    primary: { label: 'Encargar un ramo', href: '#contacto' },
    secondary: { label: 'Ver productos', href: '#servicios' },
    facts: [
      { value: '2 h', label: 'entrega en Granada' },
      { value: 'Cada día', label: 'flor fresca' },
      { value: 'Desde 1987', label: 'en el barrio' },
    ],
  },
  services: {
    title: 'Productos',
    intro: 'Precios orientativos: cada ramo se hace a tu gusto y a tu presupuesto.',
    items: [
      {
        name: 'Ramo del día',
        description: 'Flor de temporada envuelta en papel kraft.',
        price: 'desde 18 €',
      },
      { name: 'Ramo de rosas', description: 'Doce rosas con verde y lazo.', price: '35 €' },
      {
        name: 'Plantas de interior',
        description: 'Con maceta y consejos de cuidado.',
        price: 'desde 12 €',
      },
      {
        name: 'Centros de mesa',
        description: 'Para comidas, comuniones y aniversarios.',
        price: 'desde 30 €',
      },
      {
        name: 'Bodas y eventos',
        description: 'Ramo de novia, iglesia y banquete.',
        price: 'a medida',
      },
      {
        name: 'Entrega a domicilio',
        description: 'En Granada capital, en dos horas.',
        price: '5 €',
      },
    ],
    note: 'Pedidos por WhatsApp hasta las 18:00 para entregar el mismo día.',
  },
  about: {
    title: 'Una floristería de barrio',
    paragraphs: [
      'Abril abrió la tienda su madre en 1987 y hoy la llevan ella y su hija. Compramos la flor cada mañana en el mercado y la preparamos aquí mismo, a la vista.',
      'Si no sabes qué regalar, cuéntanos para quién es y lo que quieres gastar: nosotras nos encargamos del resto.',
    ],
    image: { file: 'about.jpg', alt: 'Mujer sujetando un gran ramo de flores silvestres' },
    highlights: ['Flor fresca a diario', 'Tarjeta con tu mensaje', 'Pago con tarjeta o Bizum'],
  },
  gallery: {
    title: 'En la tienda',
    images: [
      { file: 'galeria-1.jpg', alt: 'Puesto de flores lleno de color a la entrada' },
      { file: 'galeria-2.jpg', alt: 'Ramos de tulipanes envueltos en papel' },
      { file: 'galeria-3.jpg', alt: 'Centro de mesa con rosas en una copa' },
      { file: 'galeria-4.jpg', alt: 'Ramo de tulipanes de colores' },
      { file: 'galeria-5.jpg', alt: 'Girasoles en un jarrón sobre una mesa de madera' },
      { file: 'galeria-6.jpg', alt: 'Cubos con claveles rosas y rojos' },
    ],
  },
  testimonials: {
    title: 'Clientes del barrio',
    items: [
      {
        quote:
          'Encargué un ramo por WhatsApp a las once y a la una ya estaba en casa de mi madre. Precioso.',
        author: 'Lucía M.',
      },
      {
        quote: 'Nos hicieron todas las flores de la boda y quedaron mejor de lo que imaginábamos.',
        author: 'Carmen y Antonio',
      },
      {
        quote: 'Las plantas que compro aquí duran. Y siempre te explican cómo cuidarlas.',
        author: 'Rafael P.',
      },
    ],
  },
  banner: {
    title: '¿Es para hoy?',
    text: 'Escríbenos por WhatsApp antes de las 18:00 y lo entregamos esta misma tarde.',
    link: { label: 'Encargar ahora', href: '#contacto' },
  },
  contactSection: {
    title: 'Haz tu encargo',
    intro:
      'Dinos para cuándo lo quieres, para quién es y tu presupuesto. Te confirmamos enseguida.',
  },
  legal: {
    owner: 'Flores Abril (negocio ficticio)',
    taxId: '00000000T',
    address: 'Calle Molinos 8, 18009 Granada',
    email: 'pedidos@floresabril.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: la tienda, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
