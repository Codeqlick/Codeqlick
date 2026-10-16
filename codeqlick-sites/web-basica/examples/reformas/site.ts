import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://reformas.demo.codeqlick.com',
  business: {
    name: 'Reformas Duero',
    tagline: 'Reformas y fontanería · Valladolid',
    description:
      'Reformas de cocinas y baños, fontanería, pintura y pequeñas obras en Valladolid. Presupuesto sin compromiso en 48 horas.',
    schemaType: 'HomeAndConstructionBusiness',
    priceRange: '€€',
  },
  theme: {
    primary: '#A63F14',
    primaryText: '#FFFFFF',
    background: '#F9F7F4',
    surface: '#EEE9E2',
    text: '#1E1B18',
    muted: '#5C554E',
    headingFont: 'outfit',
    bodyFont: 'inter',
    corners: 'soft',
  },
  contact: {
    phone: '983 00 00 00',
    whatsapp: '34600000000',
    email: 'presupuestos@reformasduero.example',
    address: {
      street: 'Calle Santa Lucía 31',
      postalCode: '47005',
      city: 'Valladolid',
      region: 'Valladolid',
    },
  },
  hours: [
    { days: 'Lunes a viernes', hours: '8:00–18:00' },
    { days: 'Urgencias de fontanería', hours: 'Todos los días' },
  ],
  openingHoursSpec: ['Mo-Fr 08:00-18:00'],
  social: { facebook: 'https://facebook.com' },
  form: { demo: true },
  sections: ['services', 'gallery', 'about', 'testimonials'],
  navLabels: { gallery: 'Trabajos', about: 'Quiénes somos' },
  hero: {
    eyebrow: 'Reformas en Valladolid',
    title: 'Tu reforma, con fecha de fin y precio cerrado',
    text: 'Cocinas, baños, fontanería y pintura. Vamos a verlo sin compromiso y en 48 horas tienes el presupuesto por escrito.',
    image: { file: 'hero.jpg', alt: 'Cocina blanca reformada con isla y luz natural' },
    primary: { label: 'Pedir presupuesto', href: '#contacto' },
    secondary: { label: 'Ver trabajos', href: '#galeria' },
    facts: [
      { value: '48 h', label: 'para tu presupuesto' },
      { value: '+400', label: 'reformas' },
      { value: '2 años', label: 'de garantía' },
    ],
  },
  services: {
    title: 'Servicios',
    intro: 'Un solo equipo para toda la obra: no tienes que coordinar a nadie.',
    items: [
      {
        name: 'Reforma de baño',
        description: 'Plato de ducha, alicatado y sanitarios.',
        price: 'desde 4.500 €',
      },
      {
        name: 'Reforma de cocina',
        description: 'Muebles, encimera, instalación y electrodomésticos.',
        price: 'desde 7.000 €',
      },
      {
        name: 'Fontanería',
        description: 'Fugas, cambios de grifería y calentadores.',
        price: 'desde 45 €',
      },
      {
        name: 'Pintura',
        description: 'Pisos completos, con protección de muebles y suelos.',
        price: 'desde 8 €/m²',
      },
      { name: 'Suelos', description: 'Tarima, porcelánico y vinílico.', price: 'según m²' },
      {
        name: 'Pequeñas obras',
        description: 'Tabiques, puertas, molduras y arreglos.',
        price: 'por horas',
      },
    ],
    note: 'El presupuesto incluye la retirada de escombros y la limpieza final.',
  },
  gallery: {
    title: 'Trabajos recientes',
    images: [
      { file: 'galeria-1.jpg', alt: 'Cocina en forma de U con muebles de madera y blancos' },
      { file: 'galeria-2.jpg', alt: 'Baño reformado con bañera exenta y suelo de gres' },
      { file: 'galeria-3.jpg', alt: 'Salón luminoso recién pintado con suelo de espiga' },
      { file: 'galeria-4.jpg', alt: 'Carpintero cepillando una tabla de madera' },
      { file: 'galeria-5.jpg', alt: 'Pintor con rodillo frente a una pared a rayas' },
      { file: 'galeria-6.jpg', alt: 'Operario colocando tarima en una nave en obras' },
    ],
  },
  about: {
    title: 'Somos de aquí y respondemos',
    paragraphs: [
      'Reformas Duero es un equipo de seis personas: fontanero, electricista, albañiles y pintor. Llevamos más de quince años trabajando en Valladolid y alrededores.',
      'Te damos una fecha de inicio y otra de fin, y las cumplimos. Si surge algo imprevisto, te lo contamos antes de tocar nada.',
    ],
    image: {
      file: 'about.jpg',
      alt: 'Encargado de obra revisando un plano con chaleco reflectante',
    },
    highlights: [
      'Presupuesto por escrito',
      'Garantía de dos años',
      'Seguro de responsabilidad civil',
    ],
  },
  testimonials: {
    title: 'Clientes que ya estrenan casa',
    items: [
      {
        quote: 'Nos reformaron el baño en ocho días, como habían dicho. Limpios y muy serios.',
        author: 'Beatriz S.',
        detail: 'Reforma de baño',
      },
      {
        quote: 'Vinieron un domingo por una fuga y nos salvaron el techo del vecino.',
        author: 'Óscar M.',
      },
      {
        quote: 'El presupuesto fue exactamente lo que pagamos. Eso no pasa a menudo.',
        author: 'Familia Herrero',
        detail: 'Cocina y suelos',
      },
    ],
  },
  banner: {
    title: '¿Tienes una avería?',
    text: 'Para urgencias de fontanería, llámanos o escríbenos por WhatsApp: vamos el mismo día.',
    link: { label: 'Contactar ahora', href: '#contacto' },
  },
  contactSection: {
    title: 'Pide tu presupuesto',
    intro:
      'Cuéntanos qué quieres hacer y, si puedes, mándanos fotos por WhatsApp. Te llamamos para ir a verlo.',
  },
  legal: {
    owner: 'Reformas Duero (negocio ficticio)',
    taxId: '00000000T',
    address: 'Calle Santa Lucía 31, 47005 Valladolid',
    email: 'presupuestos@reformasduero.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: la empresa, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
