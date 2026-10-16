import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://fisioterapia.demo.codeqlick.com',
  business: {
    name: 'Fisio Retiro',
    tagline: 'Fisioterapia · Madrid',
    description:
      'Centro de fisioterapia junto al Retiro (Madrid): dolor de espalda, lesiones deportivas, suelo pélvico y masaje terapéutico. Primera valoración incluida.',
    schemaType: 'Physiotherapy',
    priceRange: '€€',
  },
  theme: {
    primary: '#0E6672',
    primaryText: '#FFFFFF',
    background: '#F7FAFB',
    surface: '#E8F1F3',
    text: '#10242A',
    muted: '#4A5E65',
    headingFont: 'outfit',
    bodyFont: 'inter',
    corners: 'soft',
  },
  contact: {
    phone: '910 00 00 00',
    whatsapp: '34600000000',
    email: 'citas@fisioretiro.example',
    address: {
      street: 'Calle de Ibiza 21',
      postalCode: '28009',
      city: 'Madrid',
      region: 'Comunidad de Madrid',
    },
  },
  hours: [
    { days: 'Lunes a jueves', hours: '8:00–21:00' },
    { days: 'Viernes', hours: '8:00–15:00' },
    { days: 'Fines de semana', hours: 'Cerrado' },
  ],
  openingHoursSpec: ['Mo-Th 08:00-21:00', 'Fr 08:00-15:00'],
  social: { instagram: 'https://instagram.com' },
  form: { demo: true },
  hero: {
    eyebrow: 'Fisioterapia junto al Retiro',
    title: 'Vuelve a moverte sin dolor',
    text: 'Tratamos la causa, no solo el síntoma. Sesiones de una hora, siempre con la misma fisioterapeuta y un plan de ejercicios para casa.',
    image: { file: 'hero.jpg', alt: 'Fisioterapeuta dando un masaje en la espalda a un paciente' },
    primary: { label: 'Pedir cita', href: '#contacto' },
    secondary: { label: 'Tratamientos', href: '#servicios' },
    facts: [
      { value: '60 min', label: 'por sesión' },
      { value: '+3.000', label: 'pacientes' },
      { value: 'Colegiadas', label: 'en el CPFCM' },
    ],
  },
  services: {
    title: 'Tratamientos',
    intro: 'Todas las sesiones empiezan con una valoración. Trabajamos con las principales mutuas.',
    items: [
      {
        name: 'Fisioterapia general',
        description: 'Dolor de espalda, cuello, hombro o rodilla.',
        price: '50 €',
      },
      {
        name: 'Lesiones deportivas',
        description: 'Esguinces, roturas fibrilares, tendinopatías.',
        price: '50 €',
      },
      {
        name: 'Suelo pélvico',
        description: 'Embarazo, posparto y pérdidas de orina.',
        price: '55 €',
      },
      {
        name: 'Masaje terapéutico',
        description: 'Descarga muscular y contracturas.',
        price: '45 €',
      },
      { name: 'Punción seca', description: 'Para puntos gatillo que no ceden.', price: '+10 €' },
      { name: 'Bono de 5 sesiones', description: 'Válido durante seis meses.', price: '225 €' },
    ],
    note: 'Si vienes por una lesión, trae tus informes o pruebas de imagen.',
  },
  about: {
    title: 'Fisioterapia sin cadena de montaje',
    paragraphs: [
      'En Fisio Retiro cada paciente tiene una fisioterapeuta de referencia que le sigue de principio a fin. Nada de cambiar de persona en cada sesión.',
      'Combinamos terapia manual con ejercicio terapéutico: te enseñamos qué hacer en casa para que el alivio dure y no tengas que volver cada semana.',
    ],
    image: {
      file: 'about.jpg',
      alt: 'Paciente haciendo ejercicios de rehabilitación con una escalera de agilidad',
    },
    highlights: [
      'Primera valoración incluida',
      'Sala de ejercicio equipada',
      'Factura para tu seguro',
    ],
  },
  gallery: {
    title: 'El centro',
    images: [
      { file: 'galeria-1.jpg', alt: 'Masaje en la zona lumbar' },
      { file: 'galeria-2.jpg', alt: 'Masaje en la mano' },
      { file: 'galeria-3.jpg', alt: 'Pelotas de ejercicio de colores' },
      { file: 'galeria-4.jpg', alt: 'Tratamiento en el pie' },
      { file: 'galeria-5.jpg', alt: 'Terapia manual en el cuello' },
      { file: 'galeria-6.jpg', alt: 'Masaje con piedras calientes' },
    ],
  },
  testimonials: {
    title: 'Pacientes que ya se mueven mejor',
    items: [
      {
        quote:
          'Llegué con una lumbalgia que no me dejaba ni sentarme. En tres semanas volví a correr.',
        author: 'Javier L.',
        detail: 'Corredor popular',
      },
      {
        quote:
          'Después del parto me ayudaron muchísimo con el suelo pélvico. Profesionales y muy cercanas.',
        author: 'Elena T.',
      },
      {
        quote:
          'Por fin alguien que me explica qué me pasa y me da ejercicios que puedo hacer en casa.',
        author: 'Pilar R.',
      },
    ],
  },
  banner: {
    title: '¿Te duele algo desde hace semanas?',
    text: 'No esperes a que se cronifique: la primera valoración te dice qué tienes y cómo tratarlo.',
    link: { label: 'Pedir cita', href: '#contacto' },
  },
  contactSection: {
    title: 'Pide tu cita',
    intro: 'Te llamamos para buscar el mejor hueco. Si es urgente, mejor por teléfono.',
  },
  legal: {
    owner: 'Fisio Retiro (negocio ficticio)',
    taxId: '00000000T',
    address: 'Calle de Ibiza 21, 28009 Madrid',
    email: 'citas@fisioretiro.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: el centro, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
