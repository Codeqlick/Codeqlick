import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { Category, CheckId, CheckStatus, CheckValues } from './site-audit-checks.js';

type Text = Record<ApiLocale, string>;

interface CheckTexts {
  title: Text;
  /** What a passed check says. */
  pass: Text;
  /** What a warn says (and a fail, unless it has its own). */
  warn: Text;
  fail?: Text;
}

/**
 * Every check's words, for the email and the report page (architecture 4.12). Plain language for
 * a business owner; `{name}` placeholders take the check's values.
 */
export const CHECK_TEXTS: Record<CheckId, CheckTexts> = {
  ttfb: {
    title: { es: 'Tiempo de respuesta del servidor', en: 'Server response time' },
    pass: {
      es: 'Tu servidor responde rápido ({seconds} s).',
      en: 'Your server answers quickly ({seconds} s).',
    },
    warn: {
      es: 'Tu servidor tarda {seconds} s en empezar a responder. Por encima de 0,6 s se nota; un buen alojamiento o una caché lo mejoran.',
      en: 'Your server takes {seconds} s to start answering. Above 0.6 s people notice; better hosting or caching improves it.',
    },
    fail: {
      es: 'Tu servidor tarda {seconds} s en empezar a responder: mucha gente se irá antes de ver nada. Hace falta un alojamiento más rápido o una caché.',
      en: 'Your server takes {seconds} s to start answering: many people will leave before seeing anything. It needs faster hosting or caching.',
    },
  },
  'html-size': {
    title: { es: 'Peso de la página', en: 'Page weight' },
    pass: {
      es: 'El código de la página es ligero ({kb} KB).',
      en: 'The page code is light ({kb} KB).',
    },
    warn: {
      es: 'El código de la página pesa {kb} KB, bastante para un móvil con mala cobertura. Suele venir de plantillas o constructores cargados.',
      en: 'The page code weighs {kb} KB, a lot for a phone on a weak signal. It usually comes from heavy themes or page builders.',
    },
  },
  compression: {
    title: { es: 'Compresión', en: 'Compression' },
    pass: { es: 'La página se envía comprimida.', en: 'The page is sent compressed.' },
    warn: {
      es: 'La página se envía sin comprimir. Activar gzip o Brotli en el servidor la hace varias veces más ligera.',
      en: 'The page is sent uncompressed. Turning on gzip or Brotli on the server makes it several times lighter.',
    },
  },
  'blocking-scripts': {
    title: { es: 'Scripts que frenan la carga', en: 'Scripts that hold up loading' },
    pass: {
      es: 'Los scripts no frenan que se vea la página.',
      en: "Scripts don't hold up showing the page.",
    },
    warn: {
      es: 'Hay {count} scripts en la cabecera que el navegador debe descargar antes de mostrar nada. Se pueden cargar con «defer» o «async».',
      en: 'There are {count} scripts in the head the browser must download before showing anything. They can load with "defer" or "async".',
    },
  },
  'psi-performance': {
    title: { es: 'Velocidad en móvil (Google)', en: 'Mobile speed (Google)' },
    pass: {
      es: 'Google le da {score}/100 de velocidad en móvil.',
      en: 'Google gives it {score}/100 for mobile speed.',
    },
    warn: {
      es: 'Google le da {score}/100 de velocidad en móvil. Las imágenes grandes y el exceso de código suelen ser la causa.',
      en: 'Google gives it {score}/100 for mobile speed. Large images and too much code are the usual cause.',
    },
    fail: {
      es: 'Google le da solo {score}/100 de velocidad en móvil: la web se siente lenta y eso también baja su posición en Google.',
      en: 'Google gives it only {score}/100 for mobile speed: the website feels slow, which also lowers its place in Google.',
    },
  },
  'psi-lcp': {
    title: { es: 'Tiempo hasta ver el contenido principal', en: 'Time to see the main content' },
    pass: {
      es: 'Lo principal se ve en {seconds} s en móvil.',
      en: 'The main content shows in {seconds} s on mobile.',
    },
    warn: {
      es: 'Lo principal tarda {seconds} s en verse en móvil. Google recomienda menos de 2,5 s.',
      en: 'The main content takes {seconds} s to show on mobile. Google recommends under 2.5 s.',
    },
  },
  viewport: {
    title: { es: 'Adaptada al móvil', en: 'Fits phones' },
    pass: {
      es: 'La página está preparada para pantallas de móvil.',
      en: 'The page is set up for phone screens.',
    },
    warn: {
      es: 'La página no está preparada para móvil: en un teléfono se verá pequeña y habrá que hacer zoom. Más de la mitad de las visitas llegan desde el móvil.',
      en: "The page isn't set up for phones: it will look tiny and need zooming. More than half of visits come from phones.",
    },
  },
  zoom: {
    title: { es: 'Zoom permitido', en: 'Zoom allowed' },
    pass: { es: 'Se puede ampliar la página con los dedos.', en: 'People can pinch to zoom.' },
    warn: {
      es: 'La página impide ampliar con los dedos, lo que molesta a quien ve peor. Conviene permitirlo.',
      en: 'The page stops people pinching to zoom, which hurts those who see less well. It should allow it.',
    },
  },
  lang: {
    title: { es: 'Idioma indicado', en: 'Language declared' },
    pass: {
      es: 'La página indica su idioma ({lang}).',
      en: 'The page declares its language ({lang}).',
    },
    warn: {
      es: 'La página no indica su idioma. Los lectores de pantalla y los traductores lo usan.',
      en: "The page doesn't declare its language. Screen readers and translators use it.",
    },
  },
  'touch-icon': {
    title: { es: 'Icono para el móvil', en: 'Icon for phones' },
    pass: {
      es: 'Tiene icono para la pantalla de inicio del móvil.',
      en: 'It has an icon for phone home screens.',
    },
    warn: {
      es: 'No tiene icono para la pantalla de inicio: si alguien guarda la web en su móvil verá una captura en vez de tu logo.',
      en: 'It has no home-screen icon: someone saving the website on their phone sees a screenshot instead of your logo.',
    },
  },
  title: {
    title: { es: 'Título de la página', en: 'Page title' },
    pass: {
      es: 'Tiene un título de buena longitud ({length} caracteres).',
      en: 'It has a title of a good length ({length} characters).',
    },
    warn: {
      es: 'El título tiene {length} caracteres. Entre 10 y 65 se lee entero en Google; incluye qué haces y dónde.',
      en: 'The title has {length} characters. Between 10 and 65 shows whole in Google; say what you do and where.',
    },
    fail: {
      es: 'La página no tiene título: es lo primero que Google muestra en sus resultados.',
      en: 'The page has no title: it is the first thing Google shows in its results.',
    },
  },
  description: {
    title: { es: 'Descripción para Google', en: 'Description for Google' },
    pass: {
      es: 'Tiene una descripción de buena longitud.',
      en: 'It has a description of a good length.',
    },
    warn: {
      es: 'La descripción tiene {length} caracteres. Entre 50 y 160 se ve entera en Google y atrae más clics.',
      en: 'The description has {length} characters. Between 50 and 160 shows whole in Google and gets more clicks.',
    },
    fail: {
      es: 'Falta la descripción: Google se inventará el texto bajo tu título. Una buena descripción atrae más clics.',
      en: 'There is no description: Google will make up the text under your title. A good one gets more clicks.',
    },
  },
  h1: {
    title: { es: 'Encabezado principal', en: 'Main heading' },
    pass: { es: 'Tiene un encabezado principal (H1).', en: 'It has one main heading (H1).' },
    warn: {
      es: 'Hay {count} encabezados principales (H1). Con uno solo, Google entiende mejor de qué trata la página.',
      en: 'There are {count} main headings (H1). With just one, Google understands the page better.',
    },
    fail: {
      es: 'No hay encabezado principal (H1): Google lo usa para entender de qué trata la página.',
      en: 'There is no main heading (H1): Google uses it to understand what the page is about.',
    },
  },
  'img-alt': {
    title: { es: 'Imágenes descritas', en: 'Images described' },
    pass: { es: 'Todas las imágenes tienen descripción.', en: 'Every image has a description.' },
    warn: {
      es: '{count} de {total} imágenes no tienen descripción (texto alternativo). Ayuda a Google Imágenes y a quien no ve.',
      en: '{count} of {total} images have no description (alt text). It helps Google Images and people who can’t see them.',
    },
  },
  canonical: {
    title: { es: 'Dirección principal', en: 'Main address' },
    pass: { es: 'Indica cuál es su dirección principal.', en: 'It states its main address.' },
    warn: {
      es: 'No indica su dirección principal (canonical). Evita que Google vea la misma página repetida con varias direcciones.',
      en: "It doesn't state its main address (canonical). It stops Google seeing the same page under several addresses.",
    },
  },
  indexable: {
    title: { es: 'Visible en Google', en: 'Visible in Google' },
    pass: { es: 'La página deja que Google la muestre.', en: 'The page lets Google show it.' },
    warn: {
      es: 'La página pide a Google que no la muestre («noindex»). Si no es a propósito, no aparecerá en las búsquedas.',
      en: 'The page asks Google not to show it ("noindex"). Unless that is on purpose, it won’t appear in searches.',
    },
  },
  'robots-txt': {
    title: { es: 'Archivo robots.txt', en: 'robots.txt file' },
    pass: { es: 'Tiene archivo robots.txt.', en: 'It has a robots.txt file.' },
    warn: {
      es: 'No tiene robots.txt, el archivo que indica a los buscadores qué pueden leer y dónde está el mapa del sitio.',
      en: 'It has no robots.txt, the file that tells search engines what to read and where the sitemap is.',
    },
  },
  sitemap: {
    title: { es: 'Mapa del sitio', en: 'Sitemap' },
    pass: { es: 'Tiene mapa del sitio para Google.', en: 'It has a sitemap for Google.' },
    warn: {
      es: 'No encontramos mapa del sitio (sitemap.xml). Ayuda a que Google encuentre todas tus páginas.',
      en: 'We found no sitemap (sitemap.xml). It helps Google find all your pages.',
    },
  },
  'open-graph': {
    title: { es: 'Vista al compartir', en: 'Preview when shared' },
    pass: {
      es: 'Al compartirla en WhatsApp o redes se verá con título e imagen.',
      en: 'Shared on WhatsApp or social media, it shows a title and image.',
    },
    warn: {
      es: 'Al compartirla en WhatsApp o redes no saldrá bien la imagen o el título. Se arregla con las etiquetas Open Graph.',
      en: "Shared on WhatsApp or social media, the image or title won't show well. Open Graph tags fix it.",
    },
  },
  'structured-data': {
    title: { es: 'Datos para Google', en: 'Data for Google' },
    pass: {
      es: 'Da a Google datos estructurados (horario, dirección…).',
      en: 'It gives Google structured data (hours, address…).',
    },
    warn: {
      es: 'No da a Google datos estructurados. Con ellos puede mostrar tu horario, dirección o valoraciones en los resultados.',
      en: 'It gives Google no structured data. With it, Google can show your hours, address or ratings in results.',
    },
  },
  https: {
    title: { es: 'Conexión segura (HTTPS)', en: 'Secure connection (HTTPS)' },
    pass: { es: 'La web usa conexión segura.', en: 'The website uses a secure connection.' },
    warn: {
      es: 'La web no usa conexión segura: el navegador la marca como «No segura» y Google la posiciona peor. Un certificado gratuito lo soluciona.',
      en: 'The website doesn’t use a secure connection: browsers mark it "Not secure" and Google ranks it lower. A free certificate fixes it.',
    },
  },
  'http-redirect': {
    title: { es: 'Siempre por conexión segura', en: 'Always over a secure connection' },
    pass: {
      es: 'Quien entra sin «https» acaba en la versión segura.',
      en: 'People typing it without "https" end up on the secure version.',
    },
    warn: {
      es: 'La versión sin «https» sigue abierta en vez de llevar a la segura. Hay que redirigirla.',
      en: 'The version without "https" stays open instead of sending people to the secure one. It needs a redirect.',
    },
  },
  certificate: {
    title: { es: 'Certificado de seguridad', en: 'Security certificate' },
    pass: {
      es: 'El certificado es válido ({days} días más).',
      en: 'The certificate is valid (for {days} more days).',
    },
    warn: {
      es: 'El certificado caduca en {days} días. Si no se renueva, los navegadores bloquearán la web con un aviso.',
      en: 'The certificate expires in {days} days. If it isn’t renewed, browsers will block the website with a warning.',
    },
    fail: {
      es: 'El certificado no es válido: los navegadores muestran un aviso de peligro en vez de tu web.',
      en: 'The certificate isn’t valid: browsers show a danger warning instead of your website.',
    },
  },
  hsts: {
    title: { es: 'HTTPS obligatorio (HSTS)', en: 'HTTPS enforced (HSTS)' },
    pass: {
      es: 'Obliga a los navegadores a usar siempre la conexión segura.',
      en: 'It makes browsers always use the secure connection.',
    },
    warn: {
      es: 'No obliga a los navegadores a usar siempre la conexión segura (cabecera HSTS). Es una línea en el servidor.',
      en: "It doesn't make browsers always use the secure connection (the HSTS header). It is one line on the server.",
    },
  },
  'security-headers': {
    title: { es: 'Protecciones del navegador', en: 'Browser protections' },
    pass: {
      es: 'Activa las protecciones básicas del navegador.',
      en: 'It turns on the basic browser protections.',
    },
    warn: {
      es: 'Faltan protecciones del navegador contra ataques comunes: {missing}. Se añaden en el servidor.',
      en: 'Browser protections against common attacks are missing: {missing}. They are added on the server.',
    },
  },
  'mixed-content': {
    title: { es: 'Contenido inseguro', en: 'Insecure content' },
    pass: {
      es: 'No carga nada por conexión insegura.',
      en: 'Nothing loads over an insecure connection.',
    },
    warn: {
      es: 'Carga {count} archivos por conexión insegura (http): el navegador los bloquea o quita el candado.',
      en: 'It loads {count} files over an insecure connection (http): browsers block them or drop the padlock.',
    },
  },
  versions: {
    title: { es: 'Versiones a la vista', en: 'Versions on show' },
    pass: {
      es: 'No muestra qué versiones de software usa.',
      en: "It doesn't show which software versions it runs.",
    },
    warn: {
      es: 'Muestra qué software y versión usa ({found}). Facilita a los atacantes buscar fallos conocidos; conviene ocultarlo y mantenerlo actualizado.',
      en: 'It shows which software and version it runs ({found}). That helps attackers look for known flaws; hide it and keep it updated.',
    },
  },
};

export const CATEGORY_NAMES: Record<Category, Text> = {
  speed: { es: 'Rapidez', en: 'Speed' },
  mobile: { es: 'Móvil', en: 'Mobile' },
  seo: { es: 'Google', en: 'Google' },
  security: { es: 'Seguridad', en: 'Security' },
};

function fill(template: string, locale: ApiLocale, values: CheckValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return typeof value === 'number' ? value.toLocaleString(locale) : value;
  });
}

/** A check's title and what it says, in `locale`. */
export function checkText(
  id: CheckId,
  status: CheckStatus,
  locale: ApiLocale,
  values?: CheckValues,
): { title: string; advice: string } {
  const texts = CHECK_TEXTS[id];
  const advice =
    status === 'pass' ? texts.pass : status === 'fail' ? (texts.fail ?? texts.warn) : texts.warn;
  return { title: texts.title[locale], advice: fill(advice[locale], locale, values) };
}

/** Why a site couldn't be checked, in plain words. */
export function failureText(error: string, locale: ApiLocale): string {
  const es = locale === 'es';
  if (/ENOTFOUND|EAI_AGAIN/.test(error)) {
    return es
      ? 'Ese dominio no existe o no apunta a ningún servidor. Revisa que la dirección esté bien escrita.'
      : "That domain doesn't exist or doesn't point to a server. Check the address is spelt right.";
  }
  if (/ETIMEDOUT|Timed out/.test(error)) {
    return es ? 'La web tardó demasiado en responder.' : 'The website took too long to answer.';
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH/.test(error)) {
    return es
      ? 'El servidor de la web rechazó la conexión.'
      : "The website's server refused the connection.";
  }
  if (/UNSAFE_URL|private/i.test(error)) {
    return es ? 'Esa dirección no es una web pública.' : "That address isn't a public website.";
  }
  if (/HTTP (\d+)/.test(error)) {
    const status = /HTTP (\d+)/.exec(error)![1];
    return es
      ? `La web respondió con un error (${status}) en vez de la página.`
      : `The website answered with an error (${status}) instead of the page.`;
  }
  if (/redirect/i.test(error)) {
    return es ? 'La web redirige sin parar.' : 'The website keeps redirecting.';
  }
  if (/not html/i.test(error)) {
    return es ? 'Esa dirección no es una página web.' : "That address isn't a web page.";
  }
  return es ? 'No pudimos abrir la web.' : "We couldn't open the website.";
}
