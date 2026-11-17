import type { SiteLocale } from '@/i18n/routing';
import { estimate, type CalculatorConfig, type CalculatorType } from '@/lib/calculator';
import { CONTACT_EMAIL } from '@/lib/site';

/*
 * Local service pages (architecture 6.2, "Local service pages", decision 121): four services in ten
 * Spanish cities, at /{locale}/services/<service>/<city>. Every city has its own business context
 * and one sentence per service, written for that city: never a template with the name swapped.
 * Codeqlick works remotely, so nothing here names an office, an address or a client.
 */

type Text = Record<SiteLocale, string>;

export const LOCAL_SERVICE_KEYS = ['website', 'custom', 'mobile', 'support'] as const;
export type LocalServiceKey = (typeof LOCAL_SERVICE_KEYS)[number];

export type LocalService = {
  key: LocalServiceKey;
  /** URL segment: /services/<slug>. The last three are the service pages' own slugs. */
  slug: string;
  name: Text;
  /** The cost calculator's type for the price from; the website's price is the basic website's. */
  calculatorType: CalculatorType | null;
  process: Record<SiteLocale, string[]>;
  faq: Record<SiteLocale, { q: string; a: string }[]>;
};

export const LOCAL_SERVICES: readonly LocalService[] = [
  {
    key: 'website',
    slug: 'web-design',
    name: { en: 'Web design', es: 'Diseño web' },
    calculatorType: null,
    process: {
      en: [
        'You tell us about your business: services, prices, hours and the style you like.',
        'Within a few days you get a link to see a first version on your phone.',
        'Two rounds of changes until it looks the way you want.',
        'We publish it on your domain, with HTTPS, ready to show up on Google.',
      ],
      es: [
        'Nos cuentas tu negocio: servicios, precios, horario y el estilo que te gusta.',
        'En pocos días tienes un enlace para ver una primera versión en tu móvil.',
        'Dos rondas de cambios hasta que quede como quieres.',
        'La publicamos en tu dominio, con HTTPS y lista para aparecer en Google.',
      ],
    },
    faq: {
      en: [
        {
          q: 'How much is it, and what do I pay afterwards?',
          a: 'From €200, paid once. Afterwards you only pay for the domain (about €10–15 a year, in your name) and, if you want it, the optional maintenance.',
        },
        {
          q: 'How long does it take?',
          a: 'Once we have your texts and photos, you see a first version within a few days. With the two rounds of changes, it usually goes live in one or two weeks.',
        },
        {
          q: 'Can I change the texts myself later?',
          a: 'Yes. From your client portal you can change texts, prices, opening hours and photos, preview them and publish when you are ready.',
        },
      ],
      es: [
        {
          q: '¿Cuánto cuesta y qué pago después?',
          a: 'Desde 200 €, en un solo pago. Después solo pagas el dominio (unos 10–15 € al año, a tu nombre) y, si lo quieres, el mantenimiento opcional.',
        },
        {
          q: '¿Cuánto se tarda?',
          a: 'En cuanto tengamos tus textos y fotos, ves una primera versión en pocos días. Con las dos rondas de cambios, lo normal es publicarla en una o dos semanas.',
        },
        {
          q: '¿Puedo cambiar yo los textos después?',
          a: 'Sí. Desde tu portal de cliente cambias textos, precios, horario y fotos, ves cómo quedan y publicas cuando quieras.',
        },
      ],
    },
  },
  {
    key: 'custom',
    slug: 'custom-software',
    name: { en: 'Custom software', es: 'Software a medida' },
    calculatorType: 'custom',
    process: {
      en: [
        'We study the process with you and with the people who run it every day.',
        'You get a written brief and a fixed quote for a first version.',
        'We build it in two-week sprints, with a demo at the end of each one.',
        'We launch it, train your team and hand over the code and documentation.',
      ],
      es: [
        'Analizamos el proceso contigo y con quien lo lleva cada día.',
        'Recibes un briefing por escrito y un presupuesto cerrado para una primera versión.',
        'Lo desarrollamos en sprints de dos semanas, con una demo al final de cada uno.',
        'Lo ponemos en marcha, formamos a tu equipo y te entregamos el código y la documentación.',
      ],
    },
    faq: {
      en: [
        {
          q: 'How much does custom software cost?',
          a: 'It depends on the scope, so before writing any code you get a brief and a fixed quote. We usually start with a small first version that solves the most urgent problem.',
        },
        {
          q: 'Who owns the code?',
          a: 'You do. When the project closes we hand over the code, the documentation and every access and credential.',
        },
        {
          q: 'Can it connect to the tools I already use?',
          a: 'Yes, as long as they have an API or a data export: ERP, invoicing, online shop or spreadsheets. We check it in the initial analysis.',
        },
      ],
      es: [
        {
          q: '¿Cuánto cuesta un software a medida?',
          a: 'Depende del alcance, así que antes de escribir código recibes un briefing y un presupuesto cerrado. Solemos empezar por una primera versión pequeña que resuelva lo más urgente.',
        },
        {
          q: '¿De quién es el código?',
          a: 'Tuyo. Al cerrar el proyecto te entregamos el código, la documentación y todos los accesos y credenciales.',
        },
        {
          q: '¿Se puede conectar con lo que ya uso?',
          a: 'Sí, siempre que tenga API o exportación de datos: ERP, facturación, tienda online u hojas de cálculo. Lo comprobamos en el análisis inicial.',
        },
      ],
    },
  },
  {
    key: 'mobile',
    slug: 'mobile-and-pwa',
    name: { en: 'Mobile apps and PWAs', es: 'Apps móviles y PWA' },
    calculatorType: 'mobile',
    process: {
      en: [
        'We define what has to be done from the phone, and by whom.',
        'We design for the phone first and validate it with a clickable prototype.',
        'We build the PWA in two-week sprints and test it on real devices.',
        'We publish it on your domain, ready to install, and update it without app store reviews.',
      ],
      es: [
        'Definimos qué tiene que poder hacerse desde el móvil y quién lo usará.',
        'Diseñamos primero para el móvil y lo validamos con un prototipo navegable.',
        'Desarrollamos la PWA en sprints de dos semanas y la probamos en dispositivos reales.',
        'La publicamos en tu dominio, lista para instalar, y la actualizamos sin revisiones de las tiendas.',
      ],
    },
    faq: {
      en: [
        {
          q: 'What is the difference between a PWA and an app store app?',
          a: 'A PWA is a web app installed on the phone from the browser; it works on a poor connection and can send notifications. It skips app store reviews and fees, and one build serves iPhone, Android and computers.',
        },
        {
          q: 'Does it work on iPhone?',
          a: 'Yes. On iPhone it is installed from Safari with “Add to Home Screen”, and push notifications work on recent iOS versions once it is installed.',
        },
        {
          q: 'What if I need an App Store app later?',
          a: 'If you really need something only a native app can do, we tell you before we start. The server side and the design of the PWA are reused.',
        },
      ],
      es: [
        {
          q: '¿Qué diferencia hay entre una PWA y una app de las tiendas?',
          a: 'Una PWA es una aplicación web que se instala en el móvil desde el navegador, funciona con mala conexión y puede enviar notificaciones. No pasa por la revisión ni la comisión de las tiendas, y un solo desarrollo sirve para iPhone, Android y ordenador.',
        },
        {
          q: '¿Funciona en iPhone?',
          a: 'Sí. En iPhone se instala desde Safari con «Añadir a pantalla de inicio», y las notificaciones push funcionan en las versiones recientes de iOS una vez instalada.',
        },
        {
          q: '¿Y si más adelante necesito una app en la App Store?',
          a: 'Si de verdad necesitas algo que solo da una app nativa, te lo decimos antes de empezar. La parte de servidor y el diseño de la PWA se aprovechan.',
        },
      ],
    },
  },
  {
    key: 'support',
    slug: 'maintenance-and-support',
    name: { en: 'Maintenance and support', es: 'Mantenimiento y soporte' },
    calculatorType: 'support',
    process: {
      en: [
        'We review the code, the server and the backups.',
        'We set up monitoring and propose a plan with hours and response times.',
        'We apply security updates and fix the urgent issues first.',
        'Every month, small improvements from the hours in the plan, reported in your client portal.',
      ],
      es: [
        'Revisamos el código, el servidor y las copias de seguridad.',
        'Ponemos la monitorización y te proponemos un plan con horas y tiempos de respuesta.',
        'Aplicamos las actualizaciones de seguridad y corregimos primero lo urgente.',
        'Cada mes, pequeñas mejoras con las horas del plan, contadas en tu portal de cliente.',
      ],
    },
    faq: {
      en: [
        {
          q: 'Do you maintain websites or apps you did not build?',
          a: 'Yes, after an initial review of the code and the server, so we know what state it is in and what to fix first.',
        },
        {
          q: 'What happens if the website goes down?',
          a: 'Monitoring alerts us within minutes and we act within the response times agreed in the plan. Backups are tested, not just taken.',
        },
        {
          q: 'How is it paid?',
          a: 'With a monthly fee that includes a set of hours for improvements; anything beyond them is quoted separately.',
        },
      ],
      es: [
        {
          q: '¿Mantenéis webs o apps que no habéis hecho vosotros?',
          a: 'Sí, después de una revisión inicial del código y del servidor para saber en qué estado está y qué hay que arreglar primero.',
        },
        {
          q: '¿Qué pasa si se cae la web?',
          a: 'La monitorización nos avisa en minutos y actuamos dentro de los tiempos de respuesta acordados en el plan. Las copias de seguridad se prueban, no solo se hacen.',
        },
        {
          q: '¿Cómo se paga?',
          a: 'Con una cuota mensual que incluye una bolsa de horas para mejoras; lo que pase de ahí se presupuesta aparte.',
        },
      ],
    },
  },
];

export type City = {
  /** URL segment, as the city is written locally (no accents). */
  slug: string;
  name: Text;
  /** The city's business context, 2–3 sentences. */
  context: Text;
  /** One sentence per service on what it means for businesses in this city. */
  angles: Record<LocalServiceKey, Text>;
};

export const CITIES: readonly City[] = [
  {
    slug: 'madrid',
    name: { en: 'Madrid', es: 'Madrid' },
    context: {
      en: 'Madrid is home to company headquarters, professional firms, clinics and fiercely competitive neighbourhood shops. With so much choice on every street, people compare on their phone before they call, and the business that is found quickly and understood at once wins.',
      es: 'Madrid concentra sedes de empresas, despachos profesionales, clínicas y un comercio de barrio muy competitivo. Con tanta oferta en cada calle, la gente compara en el móvil antes de llamar, y gana el negocio que se encuentra rápido y se entiende a la primera.',
    },
    angles: {
      website: {
        en: 'For a Madrid business, a fast basic website with opening hours, prices and WhatsApp is the minimum to compete in neighbourhood searches.',
        es: 'Para un negocio de Madrid, una web básica y rápida con horario, precios y WhatsApp es lo mínimo para competir en las búsquedas del barrio.',
      },
      custom: {
        en: 'Many Madrid SMEs and firms grow faster than their spreadsheets; custom software brings case files, clients and billing into one tool.',
        es: 'Muchas pymes y despachos de Madrid crecen más deprisa que sus hojas de cálculo; el software a medida reúne expedientes, clientes y facturación en una sola herramienta.',
      },
      mobile: {
        en: 'In Madrid almost everything happens on the phone, often on the metro, so an installable PWA that copes with poor coverage reaches your customers and field team better.',
        es: 'En Madrid casi todo se hace desde el móvil, muchas veces en el metro, así que una PWA instalable que aguanta la mala cobertura llega mejor a tus clientes y a tu equipo de calle.',
      },
      support: {
        en: 'If your website or app is part of your Madrid company’s daily work, maintenance keeps an update or an outage from stopping you mid-week.',
        es: 'Si tu web o tu aplicación forma parte del día a día de tu empresa en Madrid, el mantenimiento evita que una actualización o una caída te pare en plena semana.',
      },
    },
  },
  {
    slug: 'barcelona',
    name: { en: 'Barcelona', es: 'Barcelona' },
    context: {
      en: 'Barcelona combines tourism, retail, design and one of southern Europe’s most active startup ecosystems. Its customers and visitors search in several languages, and the bar for what counts as a well-made website is high.',
      es: 'Barcelona combina turismo, comercio, diseño y uno de los ecosistemas de startups más activos del sur de Europa. Sus clientes y visitantes buscan en varios idiomas, y el listón de lo que se considera una web bien hecha está alto.',
    },
    angles: {
      website: {
        en: 'A basic website for a Barcelona business can launch in Spanish and, as an extra, in Catalan or English, so both locals and visitors find you.',
        es: 'Una web básica para un negocio de Barcelona puede salir en castellano y, como extra, en catalán o inglés, para que te encuentren vecinos y visitantes.',
      },
      custom: {
        en: 'For Barcelona startups and companies that need an internal tool or a first product before hiring their own team, custom software is the shortcut.',
        es: 'Para startups y empresas de Barcelona que necesitan una herramienta interna o un primer producto antes de montar su propio equipo, el software a medida es el atajo.',
      },
      mobile: {
        en: 'In a city with as many visitors as Barcelona, a PWA that opens from a link or a QR code, with no app store, removes the hurdle of installing.',
        es: 'En una ciudad con tanto visitante como Barcelona, una PWA que se abre desde un enlace o un QR, sin pasar por la tienda de aplicaciones, quita la barrera de instalar.',
      },
      support: {
        en: 'Barcelona websites and apps that live off the tourist season can’t go down in August: maintenance watches uptime, security and backups all year.',
        es: 'Las webs y apps de Barcelona que viven de la temporada turística no pueden caerse en agosto: el mantenimiento vigila disponibilidad, seguridad y copias todo el año.',
      },
    },
  },
  {
    slug: 'valencia',
    name: { en: 'Valencia', es: 'Valencia' },
    context: {
      en: 'Valencia mixes a major port, agri-food, tourism and an entrepreneurial scene that has grown a lot over the last decade. Many family firms are making the jump to digital, and many shops live off both neighbourhood customers and visitors.',
      es: 'Valencia mezcla un gran puerto, agroalimentación, turismo y una escena emprendedora que ha crecido mucho en la última década. Muchas empresas familiares están dando el salto a lo digital, y muchos comercios viven a la vez del cliente de barrio y del visitante.',
    },
    angles: {
      website: {
        en: 'For a Valencia bar, rice restaurant or shop, a basic website puts prices, opening hours and a WhatsApp button where people look: on Google and on their phone.',
        es: 'Para un bar, una arrocería o una tienda de Valencia, la web básica pone precios, horario y el botón de WhatsApp donde te buscan: en Google y en el móvil.',
      },
      custom: {
        en: 'Family firms in Valencia that export or distribute often juggle orders and stock in spreadsheets; custom software ties them to their customers and suppliers.',
        es: 'Las empresas familiares de Valencia que exportan o distribuyen suelen llevar pedidos y stock en hojas de cálculo; el software a medida los conecta con sus clientes y proveedores.',
      },
      mobile: {
        en: 'For teams who deliver, install or visit customers around Valencia, a PWA with job sheets and photos from the phone replaces the paperwork.',
        es: 'Para equipos que reparten, instalan o visitan clientes por el área de Valencia, una PWA con partes de trabajo y fotos desde el móvil sustituye el papel.',
      },
      support: {
        en: 'If your online shop or customer portal in Valencia already brings in revenue, maintenance with monitoring warns us before a customer notices anything.',
        es: 'Si tu tienda online o tu portal de clientes en Valencia ya factura, el mantenimiento con monitorización nos avisa antes de que lo note un cliente.',
      },
    },
  },
  {
    slug: 'sevilla',
    name: { en: 'Seville', es: 'Sevilla' },
    context: {
      en: 'Seville lives off tourism and services, and has industries with real weight of their own, such as aerospace and agri-food. Its business fabric is mostly small firms and the self-employed, many still without a website of their own working for them.',
      es: 'Sevilla vive del turismo y de los servicios, y tiene industrias con peso propio, como la aeronáutica y la agroalimentaria. Su tejido es sobre todo de pequeñas empresas y autónomos, muchos todavía sin una web propia que trabaje por ellos.',
    },
    angles: {
      website: {
        en: 'A Seville hair salon, workshop or practice can have, within days, a one-page website that answers what customers ask before they call.',
        es: 'Una peluquería, un taller o un despacho de Sevilla puede tener en pocos días una web de una página que responde lo que preguntan sus clientes antes de llamar.',
      },
      custom: {
        en: 'For suppliers to Seville’s industry that handle orders, certificates and deliveries, custom software replaces email and loose spreadsheets with one system.',
        es: 'Para proveedores de la industria de Sevilla que gestionan pedidos, certificados y entregas, el software a medida cambia el correo y las hojas sueltas por un solo sistema.',
      },
      mobile: {
        en: 'With so many visitors in Seville, a PWA for booking a tour, a route or an experience works on any phone with nothing to download.',
        es: 'Con tanto visitante en Sevilla, una PWA para reservar una visita, una ruta o una experiencia funciona en cualquier móvil sin descargar nada.',
      },
      support: {
        en: 'If your Seville business’s website was built years ago and nobody looks after it, maintenance brings it up to date, protects it and keeps it fast.',
        es: 'Si la web de tu negocio en Sevilla se hizo hace años y nadie la cuida, el mantenimiento la pone al día, la protege y la mantiene rápida.',
      },
    },
  },
  {
    slug: 'malaga',
    name: { en: 'Málaga', es: 'Málaga' },
    context: {
      en: 'Málaga has become a tech hub, with the Andalusia Technology Park and international companies that have opened offices there, while remaining a tourist city. Many of its customers are foreign residents who search in English.',
      es: 'Málaga se ha convertido en un polo tecnológico, con el Parque Tecnológico de Andalucía y empresas internacionales que han abierto oficinas, sin dejar de ser una ciudad turística. Muchos de sus clientes son residentes extranjeros que buscan en inglés.',
    },
    angles: {
      website: {
        en: 'For a Málaga business, a clear basic website, with English as an extra, opens the door to foreign residents and Costa del Sol visitors.',
        es: 'Para un negocio de Málaga, una web básica clara y, como extra, en inglés abre la puerta a los residentes extranjeros y a quien visita la Costa del Sol.',
      },
      custom: {
        en: 'Málaga companies growing at the pace of the tech sector need internal tools that scale, built with the technologies that sector already uses.',
        es: 'Las empresas de Málaga que crecen al ritmo del sector tecnológico necesitan herramientas internas que escalen, hechas con las tecnologías que ese sector ya usa.',
      },
      mobile: {
        en: 'For holiday lets and tourist services in Málaga, a PWA with the stay’s information, in several languages, saves messages and calls.',
        es: 'Para alquileres vacacionales y servicios turísticos de Málaga, una PWA con la información de la estancia, en varios idiomas, ahorra mensajes y llamadas.',
      },
      support: {
        en: 'In Málaga, where the high season lasts most of the year, a website or booking app has to be up all the time; maintenance takes care of that.',
        es: 'En Málaga, donde la temporada alta dura casi todo el año, una web o una app de reservas tiene que estar siempre en pie; el mantenimiento se encarga.',
      },
    },
  },
  {
    slug: 'bilbao',
    name: { en: 'Bilbao', es: 'Bilbao' },
    context: {
      en: 'Bilbao has an industrial and engineering tradition, a major port and a services sector that grew with the city’s transformation. Its companies value rigour and documentation as much as the result, and many work in both Spanish and Basque.',
      es: 'Bilbao tiene tradición industrial e ingeniera, un puerto importante y un sector de servicios que creció con la transformación de la ciudad. Sus empresas valoran el rigor y la documentación tanto como el resultado, y muchas trabajan en castellano y en euskera.',
    },
    angles: {
      website: {
        en: 'A basic website for a Bilbao shop or professional can go live in Spanish and, as an extra, in Basque, on the same fast and accessible base.',
        es: 'Una web básica para un comercio o un profesional de Bilbao puede publicarse en castellano y, como extra, en euskera, sobre la misma base rápida y accesible.',
      },
      custom: {
        en: 'For Bilbao engineering firms and industry, custom software connects production, maintenance and the technical office, with documentation handed to your team.',
        es: 'Para ingenierías e industria de Bilbao, el software a medida conecta producción, mantenimiento y oficina técnica, con documentación entregada a tu equipo.',
      },
      mobile: {
        en: 'Technicians working on the shop floor or on site around Bilbao can log inspections and issues from a PWA, even with poor coverage.',
        es: 'Los técnicos que trabajan en planta o en obra en el entorno de Bilbao pueden registrar inspecciones e incidencias desde una PWA, incluso con mala cobertura.',
      },
      support: {
        en: 'For Bilbao companies that need to know what was done and when, maintenance comes with tested backups, security updates and agreed response times.',
        es: 'Para las empresas de Bilbao que necesitan saber qué se ha hecho y cuándo, el mantenimiento incluye copias probadas, actualizaciones de seguridad y tiempos de respuesta acordados.',
      },
    },
  },
  {
    slug: 'zaragoza',
    name: { en: 'Zaragoza', es: 'Zaragoza' },
    context: {
      en: 'Zaragoza is a logistics crossroads between Madrid, Barcelona, Valencia and Bilbao, with a large logistics platform and significant automotive and agri-food industries. Its SMEs often work with suppliers and customers spread across Spain.',
      es: 'Zaragoza es un nudo logístico entre Madrid, Barcelona, Valencia y Bilbao, con una gran plataforma logística y una industria del automóvil y agroalimentaria de peso. Sus pymes suelen trabajar con proveedores y clientes repartidos por toda España.',
    },
    angles: {
      website: {
        en: 'For a Zaragoza practice, clinic or shop, a basic website sums up what you do on one fast page that shows up on Google with your business details.',
        es: 'Para un despacho, una clínica o una tienda de Zaragoza, la web básica resume lo que haces en una página rápida que aparece en Google con tus datos de negocio.',
      },
      custom: {
        en: 'Zaragoza logistics and distribution companies gain a lot from custom software that links orders, warehouse and carriers without retyping data.',
        es: 'Las empresas de logística y distribución de Zaragoza ganan mucho con un software a medida que une pedidos, almacén y transportistas sin volver a teclear datos.',
      },
      mobile: {
        en: 'For drivers and couriers leaving Zaragoza every day, a PWA with routes, delivery notes and signatures on the phone fits on any handset.',
        es: 'Para conductores y repartidores que salen de Zaragoza cada día, una PWA con rutas, albaranes y firma en el móvil cabe en cualquier teléfono.',
      },
      support: {
        en: 'If your Zaragoza operation depends on a system that already works, maintenance keeps it secure and improves it bit by bit, without rewriting it.',
        es: 'Si tu operación en Zaragoza depende de un sistema que ya funciona, el mantenimiento lo mantiene seguro y lo mejora poco a poco, sin reescribirlo.',
      },
    },
  },
  {
    slug: 'alicante',
    name: { en: 'Alicante', es: 'Alicante' },
    context: {
      en: 'Alicante lives off tourism, retail and a large population of foreign residents, and its province has industries of its own, such as footwear. Here one business often serves locals, visitors and customers who write in another language.',
      es: 'Alicante vive del turismo, del comercio y de una gran población de residentes extranjeros, y su provincia tiene industria propia, como la del calzado. Aquí un mismo negocio atiende a menudo a vecinos, visitantes y clientes que escriben en otro idioma.',
    },
    angles: {
      website: {
        en: 'For an Alicante business, a basic website with one-tap WhatsApp and calling turns phone searches into enquiries, in your language and, as an extra, in others.',
        es: 'Para un negocio de Alicante, una web básica con WhatsApp y llamada a un toque convierte las búsquedas desde el móvil en contactos, en tu idioma y, como extra, en otros.',
      },
      custom: {
        en: 'For manufacturers and distributors in the province of Alicante, custom software joins shop orders, catalogue and production in one place.',
        es: 'Para fabricantes y distribuidores de la provincia de Alicante, el software a medida reúne pedidos de tiendas, catálogo y producción en un solo sitio.',
      },
      mobile: {
        en: 'Alicante estate agents and rental managers can share listings, send documents and get notifications from a PWA the client opens from a link.',
        es: 'Las inmobiliarias y gestoras de alquiler de Alicante pueden enseñar fichas, enviar documentos y recibir avisos desde una PWA que el cliente abre con un enlace.',
      },
      support: {
        en: 'With customers in several countries, an Alicante business’s website has to load fast and stay secure at any hour; maintenance keeps an eye on it.',
        es: 'Con clientes en varios países, la web de un negocio de Alicante tiene que cargar rápido y estar segura a cualquier hora; el mantenimiento la vigila.',
      },
    },
  },
  {
    slug: 'murcia',
    name: { en: 'Murcia', es: 'Murcia' },
    context: {
      en: 'Murcia is one of Europe’s great market gardens, with an export-driven agri-food industry, and a university city full of shops and services. Many of its companies sell abroad and need their information organised and up to date.',
      es: 'Murcia es una de las grandes huertas de Europa, con una industria agroalimentaria exportadora, y una ciudad universitaria llena de comercios y servicios. Muchas de sus empresas venden fuera y necesitan su información ordenada y al día.',
    },
    angles: {
      website: {
        en: 'For Murcia shops, academies and professionals, a basic website is the quick way onto Google with hours, services and contact details, with no compulsory fees.',
        es: 'Para comercios, academias y profesionales de Murcia, una web básica es la forma rápida de estar en Google con horario, servicios y contacto, sin cuotas obligatorias.',
      },
      custom: {
        en: 'Murcia cooperatives and exporters that cross-reference field, warehouse and customer data find in custom software a way to stop copying and pasting.',
        es: 'Las cooperativas y exportadoras de Murcia que cruzan datos de campo, almacén y clientes encuentran en el software a medida una forma de dejar de copiar y pegar.',
      },
      mobile: {
        en: 'On Murcia farms and in its warehouses, a PWA for logging reports, treatments or deliveries from the phone keeps working when coverage drops.',
        es: 'En las fincas y almacenes de Murcia, una PWA para registrar partes, tratamientos o recepciones desde el móvil sigue funcionando aunque falle la cobertura.',
      },
      support: {
        en: 'Murcia’s harvest seasons bring sharp peaks; maintenance gets the website or app ready before each one and makes sure it holds.',
        es: 'Las campañas de Murcia traen picos muy marcados; el mantenimiento prepara la web o la aplicación antes de cada una y vigila que aguante.',
      },
    },
  },
  {
    slug: 'palma',
    name: { en: 'Palma', es: 'Palma' },
    context: {
      en: 'Palma is Mallorca’s gateway: hospitality, yachting, holiday lets and services for residents and visitors from many countries. The season sets the rhythm of the year, and many customers search and book from outside the island.',
      es: 'Palma es la puerta de Mallorca: hostelería, náutica, alquiler vacacional y servicios para residentes y visitantes de muchos países. La temporada marca el ritmo del año, y buena parte de los clientes busca y reserva desde fuera de la isla.',
    },
    angles: {
      website: {
        en: 'For a Palma restaurant, boat repair yard or guesthouse, a basic website ready before the season catches enquiries from people planning their trip.',
        es: 'Para un restaurante, un taller náutico o un alojamiento de Palma, una web básica lista antes de la temporada recoge las consultas de quien planea su viaje.',
      },
      custom: {
        en: 'Palma service companies that coordinate seasonal staff, shifts and clients can swap the group chat for a tool built around how they work.',
        es: 'Las empresas de servicios de Palma que coordinan personal de temporada, turnos y clientes pueden cambiar el grupo de mensajes por una herramienta hecha a su medida.',
      },
      mobile: {
        en: 'For holiday lets and yachting services in Palma, a PWA with check-in, house rules and issue reporting in several languages opens from a QR code.',
        es: 'Para alquileres y servicios náuticos de Palma, una PWA con check-in, normas e incidencias en varios idiomas se abre desde un QR, sin descargas.',
      },
      support: {
        en: 'In Palma the website can’t fail in July; maintenance makes the big changes in the low season and keeps watch the rest of the year.',
        es: 'En Palma la web no puede fallar en julio; el mantenimiento hace los cambios grandes en temporada baja y vigila el resto del año.',
      },
    },
  },
];

export function localServiceBySlug(slug: string): LocalService | undefined {
  return LOCAL_SERVICES.find((service) => service.slug === slug);
}

export function cityBySlug(slug: string): City | undefined {
  return CITIES.find((city) => city.slug === slug);
}

/** Every local page's params, for generateStaticParams (locale-less). */
export function localPageParams(): { slug: string; city: string }[] {
  return LOCAL_SERVICES.flatMap((service) =>
    CITIES.map((city) => ({ slug: service.slug, city: city.slug })),
  );
}

/** Locale-less paths for the sitemap: the web design hub (the other hubs are service pages) and every local page. */
export function localSeoPaths(): string[] {
  return [
    '/services/web-design',
    ...localPageParams().map(({ slug, city }) => `/services/${slug}/${city}`),
  ];
}

/** The page's title, without the site name (the layout's template adds it). */
export function localPageTitle(locale: SiteLocale, service: LocalService, city: City): string {
  const base = `${service.name[locale]} ${locale === 'es' ? 'en' : 'in'} ${city.name[locale]}`;
  // The basic website's fixed price is part of what people search for.
  if (service.key === 'website')
    return locale === 'es' ? `${base} desde 200 €` : `${base} from €200`;
  return base;
}

/** The page's meta description: the sentence written for this service in this city. */
export function localPageDescription(
  locale: SiteLocale,
  service: LocalService,
  city: City,
): string {
  return city.angles[service.key][locale];
}

/** The intro: the city's context, then what the service means there. */
export function localPageIntro(locale: SiteLocale, service: LocalService, city: City): string[] {
  return [city.context[locale], city.angles[service.key][locale]];
}

/** The service's questions, plus the city's: Codeqlick works remotely. */
export function localPageFaq(
  locale: SiteLocale,
  service: LocalService,
  city: City,
): { q: string; a: string }[] {
  const name = city.name[locale];
  const remote =
    locale === 'es'
      ? {
          q: `¿Tenéis oficina en ${name}?`,
          a: `No. Codeqlick trabaja en remoto con negocios de toda España, también de ${name}: hablamos por videollamada, ves cada avance en un enlace de prueba y en tu portal de cliente, y todo queda por escrito.`,
        }
      : {
          q: `Do you have an office in ${name}?`,
          a: `No. Codeqlick works remotely with businesses all over Spain, ${name} included: we talk by video call, you see every step on a preview link and in your client portal, and everything is agreed in writing.`,
        };
  return [...service.faq[locale], remote];
}

/** The basic website's price in euros (BasicWebsite.price in the messages says the same). */
export const BASIC_WEBSITE_PRICE = 200;

/**
 * The price from, in euros: the basic website's for web design; for the others the smallest size of
 * the published calculator, or null while it isn't published or the service isn't priced in it.
 */
export function localPriceFrom(
  service: LocalService,
  calculator: CalculatorConfig | null,
): number | null {
  if (service.key === 'website') return BASIC_WEBSITE_PRICE;
  const type = service.calculatorType;
  if (!calculator || !type || calculator.types[type].max <= 0) return null;
  const { min } = estimate(calculator, { type, size: 'small', extras: [] });
  return min > 0 ? min : null;
}

const SPAIN: Text = { en: 'Spain', es: 'España' };

/**
 * Structured data of a local page: the Service in the city, offered by Codeqlick as a
 * ProfessionalService with no address (it works remotely), and the breadcrumb.
 */
export function localPageJsonLd({
  locale,
  service,
  city,
  siteUrl,
  servicesLabel,
  price,
}: {
  locale: SiteLocale;
  service: LocalService;
  city: City;
  siteUrl: string;
  /** "Services" in the page's language, for the breadcrumb. */
  servicesLabel: string;
  price: number | null;
}): Record<string, unknown>[] {
  const url = `${siteUrl}/${locale}/services/${service.slug}/${city.slug}`;
  const country = { '@type': 'Country', name: SPAIN[locale] };
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: localPageTitle(locale, service, city),
      serviceType: service.name[locale],
      description: localPageDescription(locale, service, city),
      url,
      inLanguage: locale,
      areaServed: { '@type': 'City', name: city.name[locale], containedInPlace: country },
      provider: {
        '@type': 'ProfessionalService',
        name: 'Codeqlick',
        url: `${siteUrl}/${locale}`,
        email: CONTACT_EMAIL,
        areaServed: country,
      },
      ...(price === null
        ? {}
        : {
            offers: {
              '@type': 'Offer',
              url,
              priceCurrency: 'EUR',
              priceSpecification: {
                '@type': 'PriceSpecification',
                minPrice: price,
                priceCurrency: 'EUR',
              },
            },
          }),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: servicesLabel,
          item: `${siteUrl}/${locale}/services`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: service.name[locale],
          item: `${siteUrl}/${locale}/services/${service.slug}`,
        },
        { '@type': 'ListItem', position: 3, name: city.name[locale], item: url },
      ],
    },
  ];
}
