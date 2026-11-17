import type { CruisingLegalTexts } from '../cruising';

/** Cruising's terms of use and privacy policy in Spanish. */
export const es: CruisingLegalTexts = {
  updated: '17 de noviembre de 2026',
  owner: {
    owner: 'Titular',
    taxId: 'NIF',
    address: 'Dirección',
    email: 'Correo electrónico',
    website: 'Sitio web',
  },
  terms: {
    title: 'Condiciones de uso de Cruising',
    description:
      'Quién puede usar Cruising, qué se puede aportar, cómo moderamos y cómo darte de baja.',
    markdown: (c) => `## Quién presta el servicio

Cruising (cruising.codeqlick.com) es un servicio de:

${c.ownerLines}

## Qué es

Un directorio de lugares de encuentro entre hombres, con mapa y opiniones de personas adultas. No es una guía de turismo ni un servicio de citas: solo recoge información que aportan los miembros, que revisamos antes de publicarla.

## Solo para mayores de 18 años

Para proponer un lugar, opinar o denunciar declaras que tienes al menos 18 años (y la mayoría de edad de tu país, si es mayor). Puedes mirar el mapa y las fichas sin cuenta, pero este servicio habla de sexualidad adulta: si no eres adulto, no lo uses. Cerramos cualquier cuenta que creamos de un menor.

## Tu cuenta

Necesitas una cuenta verificada por correo y entrar en Cruising con tu fecha de nacimiento, las normas y tu consentimiento. Eres responsable de lo que hagas con ella.

## Lo que aportas

- Lugares que existan y que conozcas, con datos ciertos: nombre, tipo, ubicación, descripción y mejores horas.
- **Nunca** cerca de colegios, parques infantiles ni lugares frecuentados por menores. Si dudamos, lo rechazamos.
- Opiniones sinceras y respetuosas, sin datos de contacto (teléfonos, correos, enlaces ni otras apps), sin identificar a personas y sin fotos de personas sin su consentimiento.
- Cada lugar lo revisa el equipo antes de publicarse y puede corregirlo. Las opiniones se publican al momento y las moderamos después.
- Sigues siendo autor de tus textos. Nos das permiso, no exclusivo y gratuito, para guardarlos y mostrarlos en Cruising mientras no los borres.

## Fotos y vídeos

- Los miembros que han entrado y están **verificados** pueden subir a su perfil fotos y vídeos **de sí mismos**. Se permite el contenido sexual propio entre personas adultas, que solo ven los miembros que han entrado.
- **Nadie menor de 18 años** puede aparecer, y nada que sea ilegal. No puede aparecer nadie que no haya dado su consentimiento ni imágenes que no sean tuyas. Marcas una casilla de consentimiento en cada subida.
- Las fotos y los vídeos se **publican antes de que el equipo los revise**; el equipo los revisa después y retira lo que incumpla estas condiciones, bloqueando la imagen para que no vuelva a subirse. Podemos suspender la cuenta.
- La **verificación** es una foto tuya con tu apodo, «Codeqlick» y la fecha, que revisa el equipo y se guarda en privado mientras la verificación siga vigente (véase «Seguridad entre las apps +18 de Codeqlick»). La insignia «Verificado» solo significa que el equipo comprobó esa foto: no que se haya comprobado un documento de identidad.
- Sigues siendo autor de lo que subes y nos das permiso, no exclusivo y gratuito, para guardarlo y mostrarlo en Cruising mientras no lo borres.

## Cómo te comportas

Respeta a los demás, el lugar y la ley del sitio donde estás. Nada de venta de sexo o drogas, acoso, amenazas, chantaje ni discriminación. Si algo es peligroso o ilegal, denúncialo. Puedes ver las normas completas en [Normas](/${c.locale}/cruising/rules).

## Moderación, denuncias y retirada

Puedes denunciar cualquier lugar, opinión, perfil, foto o vídeo. Una denuncia por un menor, por falta de consentimiento, por imágenes robadas o por contenido ilegal oculta el contenido al momento hasta que lo revisemos. Cualquiera, aunque no tenga cuenta, puede pedir que retiremos un lugar en [cruising.codeqlick.com/${c.locale}/takedown](/${c.locale}/cruising/takedown); si se trata de un menor o de algo ilegal y da el enlace, lo ocultamos al momento, y siempre respondemos en 24 horas. Un lugar retirado por moderación no se puede volver a enviar. Si retiramos algo tuyo o suspendemos tu cuenta, te decimos el motivo por correo y puedes contestarnos para pedir que lo revisemos (Reglamento de Servicios Digitales).

## Lo que no garantizamos

Cruising es gratuito y se ofrece tal cual. La información la aportan los miembros: puede ser errónea, estar desactualizada o haber cambiado, y un lugar puede ser peligroso o estar vigilado. Ir a un lugar es decisión y responsabilidad tuya. No respondemos de lo que no dependa de nosotros, salvo en lo que la ley no permita excluir.

## Cambios y baja

Podemos cambiar estas condiciones; si es un cambio importante, te pediremos que las aceptes de nuevo al entrar. Puedes darte de baja cuando quieras borrando tu cuenta en «Mi cuenta»: se borran tu perfil, tus opiniones y tus denuncias, y los lugares que propusiste siguen publicados sin tu nombre.

## Ley aplicable

Estas condiciones se rigen por la legislación española. Para cualquier duda o queja, escríbenos a ${c.mail}.`,
  },
  privacy: {
    title: 'Política de privacidad de Cruising',
    description:
      'Qué datos trata Cruising, con qué base legal, cuánto tiempo y cómo ejercer tus derechos.',
    markdown: (c) => `## Responsable del tratamiento

${c.ownerLines}

## Datos especialmente protegidos

Usar Cruising puede revelar aspectos de tu **vida sexual u orientación sexual**, datos de categoría especial (artículo 9 del RGPD). Solo los tratamos con tu **consentimiento explícito** (artículo 9.2.a), que das al marcar una casilla propia cuando entras en Cruising. Puedes retirarlo cuando quieras borrando tu cuenta. Mirar el mapa y las fichas sin cuenta no requiere ningún dato tuyo.

## Qué datos tratamos y para qué

- **Cuenta:** nombre, correo, contraseña (cifrada) e idioma, para darte acceso (artículo 6.1.b).
- **Edad:** compruebas tu fecha de nacimiento al entrar, pero **solo guardamos el año**.
- **Entrada:** la versión de las normas que aceptaste y cuándo, y si has activado los avisos por correo.
- **Lugares:** los que propones (nombre, tipo, ubicación, descripción, horas) con tu cuenta, para que puedas verlos y editarlos y para moderarlos.
- **Opiniones y denuncias:** las que escribes y las que haces.
- **Fotos y vídeos (datos de categoría especial):** los que subes a tu perfil, con tu **consentimiento explícito** en cada subida (artículo 9.2.a). Les quitamos los metadatos (ubicación, cámara). Se guardan en servidores de la Unión Europea (OVHcloud), **fuera de las copias de seguridad**, y los ven solo los miembros que han entrado, nunca los buscadores.
- **Foto de verificación:** la que nos envías con tu apodo, «Codeqlick» y la fecha; solo la ve el equipo. Si se aprueba, se **guarda en privado mientras la verificación siga vigente** y se borra cuando se retira o se pierde, se sustituye o borras tu cuenta; una rechazada se borra al momento. La verificación se comparte con las otras apps +18 de Codeqlick (véase la última sección).
- **Salud sexual (datos de salud, categoría especial):** solo si la activas, con su **propio consentimiento explícito** (artículo 9.2.a), distinto del de la entrada: si tomas PrEP, el mes de tu última prueba y cada cuánto quieres que te recordemos la revisión. Por defecto solo los ves tú; si eliges mostrarlos, los ven los miembros que han entrado en tu perfil. Al desactivarla se **borran** en el momento. Los recordatorios solo dicen «Es hora de tu revisión».
- **Contactos de confianza y temporizador de seguridad:** el correo y el nombre con el que te presentas a hasta 2 personas que eliges, y si han aceptado (interés legítimo en tu seguridad, artículo 6.1.f; cada contacto da su propio consentimiento al aceptar por correo y puede dejarlo cuando quiera). Del temporizador guardamos la hora de fin, tu mensaje y, solo si eliges compartirlo, el lugar. Si no lo terminas a tiempo, enviamos a tus contactos que aceptaron un único correo con ese nombre, tu mensaje, la hora y el lugar compartido; nunca tu apodo ni qué es Cruising.
- **Seguridad:** la dirección IP y el navegador de cada sesión (interés legítimo, artículo 6.1.f).
- **Tu posición:** si pulsas «Localizarme», el navegador centra el mapa en tu posición. **Esa posición nunca sale de tu dispositivo: no se envía ni se guarda.**

## Correos

Te escribimos cuando el equipo publica o rechaza un lugar tuyo, o suspende tu cuenta. Los correos nunca incluyen el nombre del lugar ni su contenido. Puedes desactivar el aviso de «lugar publicado» en tu perfil; las decisiones del equipo te las enviamos siempre.

## El mapa

Las imágenes del mapa las carga tu navegador directamente de los servidores de la **Fundación OpenStreetMap**, que reciben tu dirección IP y la zona que miras. Se rigen por su [política de privacidad](https://wiki.osmfoundation.org/wiki/Privacy_Policy). El mapa es © colaboradores de OpenStreetMap.

## Quién ve tus datos

Los lugares publicados los ve cualquiera, sin tu nombre. Las opiniones solo las ven los miembros que han entrado, como «Miembro». Tu nombre y tu correo nunca se muestran. No vendemos ni cedemos datos a nadie, salvo obligación legal (por ejemplo, ante una orden judicial o para denunciar contenido de menores). El único encargado del tratamiento es **OVHcloud**, que aloja el servicio, la base de datos y el correo en servidores de la Unión Europea.

## Cuánto tiempo los guardamos

Mientras tengas la cuenta. Tus fotos y vídeos, hasta que los borres tú o borres la cuenta; los archivos desaparecen del servidor en un máximo de 6 horas. La foto de verificación, si se aprueba, se guarda mientras la verificación siga vigente; una rechazada se borra al momento. Los temporizadores, 7 días después de terminar. Al borrar la cuenta se borran tu perfil, tus opiniones, tus denuncias, tus datos de salud, tus contactos de confianza y tus temporizadores; los lugares que propusiste siguen publicados sin tu nombre. Las copias de seguridad se eliminan a los 14 días.

## Tus derechos

Puedes descargar tus datos y borrar tu cuenta desde «Mi cuenta». También puedes pedirnos acceder a tus datos, rectificarlos, suprimirlos, limitar u oponerte a su tratamiento o recibirlos en un formato portable escribiendo a ${c.mail}. Si crees que no los hemos tratado bien, puedes reclamar ante la Agencia Española de Protección de Datos ([aepd.es](https://www.aepd.es)).

## Cookies

Solo cookies técnicas: \`NEXT_LOCALE\` (idioma) y \`cq_at\` / \`cq_rt\` (sesión iniciada). Sin publicidad.`,
  },
};
