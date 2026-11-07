import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://despacho.demo.codeqlick.com',
  business: {
    name: 'Ortega & Sanz Abogados',
    tagline: 'Abogados · Zaragoza',
    description:
      'Despacho de abogados en Zaragoza: derecho de familia, laboral, herencias y reclamaciones. Primera consulta de 30 minutos sin compromiso.',
    schemaType: 'LegalService',
    priceRange: '€€',
  },
  theme: {
    primary: '#1E3A5F',
    primaryText: '#FFFFFF',
    background: '#F8F9FB',
    surface: '#EBEFF5',
    text: '#14202E',
    muted: '#4B5868',
    headingFont: 'playfair',
    bodyFont: 'inter',
    corners: 'soft',
  },
  contact: {
    phone: '976 00 00 00',
    whatsapp: '34600000000',
    email: 'consultas@ortegasanz.example',
    address: {
      street: 'Paseo de la Independencia 22, 3.º',
      postalCode: '50004',
      city: 'Zaragoza',
      region: 'Aragón',
    },
  },
  hours: [
    { days: 'Lunes a jueves', hours: '9:00–14:00 y 16:00–19:00' },
    { days: 'Viernes', hours: '9:00–14:00' },
  ],
  openingHoursSpec: ['Mo-Th 09:00-14:00', 'Mo-Th 16:00-19:00', 'Fr 09:00-14:00'],
  social: { facebook: 'https://facebook.com' },
  form: { demo: true },
  navLabels: {
    services: 'Áreas',
    about: 'El despacho',
    gallery: 'Oficina',
    testimonials: 'Clientes',
  },
  hero: {
    eyebrow: 'Abogados en Zaragoza',
    title: 'Te explicamos tu caso en claro, antes de empezar',
    text: 'Familia, trabajo, herencias y reclamaciones. En la primera consulta te decimos qué opciones tienes y cuánto costará, sin letra pequeña.',
    image: {
      file: 'hero.jpg',
      alt: 'Dos abogados atendiendo a una clienta en una sala de reuniones',
    },
    primary: { label: 'Pedir una consulta', href: '#contacto' },
    secondary: { label: 'Áreas de trabajo', href: '#servicios' },
    facts: [
      { value: '25 años', label: 'de experiencia' },
      { value: '30 min', label: 'primera consulta' },
      { value: 'Presupuesto', label: 'cerrado por escrito' },
    ],
  },
  services: {
    title: 'Áreas de trabajo',
    intro: 'Te damos un presupuesto cerrado antes de empezar. Sin sorpresas en la factura.',
    items: [
      {
        name: 'Familia',
        description: 'Divorcios de mutuo acuerdo, custodia y pensiones.',
        price: 'desde 600 €',
      },
      {
        name: 'Laboral',
        description: 'Despidos, reclamaciones de salario y bajas.',
        price: 'según caso',
      },
      {
        name: 'Herencias',
        description: 'Testamentos, particiones y aceptación de herencias.',
        price: 'desde 450 €',
      },
      {
        name: 'Reclamaciones',
        description: 'Bancos, aerolíneas, seguros y comunidades de vecinos.',
        price: 'según caso',
      },
      { name: 'Contratos', description: 'Alquileres, compraventas y acuerdos entre socios.' },
      { name: 'Primera consulta', description: 'Presencial o por videollamada.', price: 'Gratis' },
    ],
  },
  about: {
    title: 'Un despacho pequeño, a propósito',
    paragraphs: [
      'Lucía Ortega y Pablo Sanz fundaron el despacho en 2001. Seguimos siendo pocos porque queremos que cada cliente sepa siempre quién lleva su caso y pueda llamarle.',
      'Te contamos cada paso en un lenguaje que se entiende y te avisamos antes de cualquier gasto.',
    ],
    image: { file: 'about.jpg', alt: 'Dos mujeres conversando en una mesa junto a un ventanal' },
    highlights: [
      'Colegiados en el REICAZ',
      'Videollamada si no puedes venir',
      'Presupuesto cerrado',
    ],
  },
  gallery: {
    title: 'El despacho',
    images: [
      { file: 'galeria-1.jpg', alt: 'Apretón de manos sobre una mesa de reuniones' },
      { file: 'galeria-2.jpg', alt: 'Mano firmando un documento con pluma' },
      { file: 'galeria-3.jpg', alt: 'Sala de espera luminosa con sofás' },
      { file: 'galeria-4.jpg', alt: 'Sala de reuniones con una mesa larga' },
      { file: 'galeria-5.jpg', alt: 'Abogado revisando documentos' },
      { file: 'galeria-6.jpg', alt: 'Estantería con libros de derecho antiguos' },
    ],
  },
  testimonials: {
    title: 'Lo que dicen nuestros clientes',
    items: [
      {
        quote: 'Me explicaron el divorcio paso a paso y cerramos todo en tres meses, sin juicio.',
        author: 'Marta P.',
      },
      {
        quote: 'Recuperamos el dinero de la cláusula suelo. Siempre supe en qué punto estaba.',
        author: 'Andrés y Carmen',
      },
      {
        quote:
          'Con la herencia de mis padres había mucho lío entre hermanos. Lo resolvieron con mucha mano izquierda.',
        author: 'José Luis R.',
      },
    ],
  },
  banner: {
    title: '¿No sabes si tienes un caso?',
    text: 'Cuéntanoslo en la primera consulta, que es gratis. Si no merece la pena, te lo diremos.',
    link: { label: 'Pedir una consulta', href: '#contacto' },
  },
  contactSection: {
    title: 'Pide tu primera consulta',
    intro: 'Cuéntanos brevemente tu caso. Te llamamos en un día laborable para darte cita.',
  },
  legal: {
    owner: 'Ortega & Sanz Abogados (negocio ficticio)',
    taxId: '00000000T',
    address: 'Paseo de la Independencia 22, 50004 Zaragoza',
    email: 'consultas@ortegasanz.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: el despacho, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
