import type { Site } from '../../src/types';

const site: Site = {
  demo: true,
  url: 'https://peluqueria.demo.codeqlick.com',
  business: {
    name: 'Alba Estudio',
    tagline: 'Peluquería · Sevilla',
    description:
      'Peluquería en Triana (Sevilla): cortes, color, mechas balayage y peinados de evento. Pide cita por WhatsApp o por teléfono.',
    schemaType: 'HairSalon',
    priceRange: '€€',
  },
  theme: {
    primary: '#A84A33',
    primaryText: '#FFFFFF',
    background: '#FBF7F4',
    surface: '#F4ECE6',
    text: '#2A1F1C',
    muted: '#6B5A54',
    headingFont: 'playfair',
    bodyFont: 'inter',
    corners: 'round',
  },
  contact: {
    phone: '954 00 00 00',
    whatsapp: '34600000000',
    email: 'hola@albaestudio.example',
    address: {
      street: 'Calle Pureza 48',
      postalCode: '41010',
      city: 'Sevilla',
      region: 'Andalucía',
    },
  },
  hours: [
    { days: 'Lunes', hours: 'Cerrado' },
    { days: 'Martes a viernes', hours: '9:30–20:00' },
    { days: 'Sábado', hours: '9:00–14:00' },
  ],
  openingHoursSpec: ['Tu-Fr 09:30-20:00', 'Sa 09:00-14:00'],
  social: { instagram: 'https://instagram.com', facebook: 'https://facebook.com' },
  form: { demo: true },
  hero: {
    eyebrow: 'Peluquería en Triana',
    title: 'Tu pelo, en las mejores manos del barrio',
    text: 'Cortes, color y peinados pensados para ti. Te escuchamos, te aconsejamos y salimos juntas con el resultado que buscabas.',
    image: { file: 'hero.jpg', alt: 'Peluquera secando y peinando el pelo de una clienta' },
    primary: { label: 'Pedir cita', href: '#contacto' },
    secondary: { label: 'Ver servicios', href: '#servicios' },
    facts: [
      { value: '12 años', label: 'en Triana' },
      { value: '4,9 ★', label: 'en Google' },
      { value: 'Sin prisas', label: 'cita a tu hora' },
    ],
  },
  services: {
    title: 'Lo que hacemos',
    intro:
      'Precios orientativos para pelo medio. Te confirmamos el precio exacto antes de empezar.',
    items: [
      {
        name: 'Corte y peinado',
        description: 'Lavado, corte a tu medida y secado.',
        price: '28 €',
      },
      {
        name: 'Color',
        description: 'Tinte de raíz o completo, con productos sin amoniaco.',
        price: 'desde 35 €',
      },
      {
        name: 'Mechas balayage',
        description: 'Iluminación natural, a mano alzada.',
        price: 'desde 75 €',
      },
      {
        name: 'Tratamiento de hidratación',
        description: 'Para pelo seco o castigado por el sol.',
        price: '25 €',
      },
      {
        name: 'Peinado de evento',
        description: 'Bodas, comuniones y fiestas. Prueba incluida.',
        price: 'desde 45 €',
      },
      { name: 'Corte infantil', description: 'Hasta 10 años, con paciencia.', price: '14 €' },
    ],
    note: 'Novias: pregunta por el paquete con prueba, peinado y maquillaje.',
  },
  about: {
    title: 'Un estudio pequeño, a propósito',
    paragraphs: [
      'Alba abrió el estudio en 2014 con una idea sencilla: atender a una clienta cada vez, sin prisas y sin salir con un corte que no te has pedido.',
      'Hoy somos tres en el equipo y seguimos igual: antes de tocar tu pelo hablamos de cómo te lo peinas cada día, y te explicamos qué podemos hacer y qué no.',
    ],
    image: { file: 'about.jpg', alt: 'Interior del estudio con sillones rojos y plantas' },
    highlights: [
      'Productos veganos y sin amoniaco',
      'Diagnóstico de pelo gratis en la primera visita',
      'Cita a tu hora, sin esperas',
    ],
  },
  gallery: {
    title: 'Nuestro trabajo',
    images: [
      { file: 'galeria-6.jpg', alt: 'Tijeras cortando un mechón de pelo' },
      { file: 'galeria-1.jpg', alt: 'Clienta durante un corte de pelo' },
      { file: 'galeria-2.jpg', alt: 'Mechas con papel de aluminio' },
      { file: 'galeria-3.jpg', alt: 'Peluquero cortando con tijeras y peine' },
      { file: 'galeria-4.jpg', alt: 'Recogido con horquillas, en blanco y negro' },
      { file: 'galeria-5.jpg', alt: 'Rulos en un pelo largo' },
    ],
  },
  testimonials: {
    title: 'Lo que dicen nuestras clientas',
    items: [
      {
        quote:
          'Llevo años probando peluquerías y aquí por fin me entienden. El balayage me ha quedado natural, como yo quería.',
        author: 'Lucía M.',
        detail: 'Clienta desde 2019',
      },
      {
        quote:
          'Me peinaron para la boda de mi hermana y aguantó perfecto hasta las tantas. Un trato buenísimo.',
        author: 'Carmen R.',
      },
      {
        quote: 'Puntuales, cariñosas y con muy buen gusto. Mi hija ya no quiere ir a otro sitio.',
        author: 'Rocío G.',
      },
    ],
  },
  banner: {
    title: '¿Te damos cita esta semana?',
    text: 'Escríbenos por WhatsApp y te decimos los huecos libres.',
    link: { label: 'Pedir cita', href: '#contacto' },
  },
  contactSection: {
    title: 'Pide tu cita',
    intro: 'Llámanos, escríbenos por WhatsApp o déjanos un mensaje y te contestamos el mismo día.',
  },
  legal: {
    owner: 'Alba Estudio (negocio ficticio)',
    taxId: '00000000T',
    address: 'Calle Pureza 48, 41010 Sevilla',
    email: 'hola@albaestudio.example',
  },
  footerNote:
    'Web de demostración de Codeqlick: el negocio, las opiniones y los datos de contacto son ficticios. Fotos de dominio público (CC0).',
};

export default site;
