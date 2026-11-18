import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { CheckGroup, CheckId, CheckStatus, CheckValue } from './security-check-types.js';

type Values = Record<string, CheckValue>;
interface Bilingual {
  en: string;
  es: string;
}
const t = (en: string, es: string): Bilingual => ({ en, es });

/** What a check means in the status it got, and how to fix it (only shown when not a pass). */
interface Entry {
  title: Bilingual;
  explain: (status: CheckStatus, values: Values) => Bilingual;
  fix?: (status: CheckStatus, values: Values) => Bilingual | undefined;
}

/** An explanation chosen by status, `{name}` filled from the check's values. */
const byStatus =
  (table: Partial<Record<CheckStatus, Bilingual>>) =>
  (status: CheckStatus): Bilingual =>
    table[status] ?? table.info ?? table.fail ?? table.pass!;

const NO_WEBSITE = t(
  'No website answered over HTTPS, so this check could not run.',
  'Ninguna web respondió por HTTPS, así que esta comprobación no pudo hacerse.',
);
const NO_EMAIL = t(
  'This domain seems to send no email, so this check was skipped.',
  'Este dominio parece no enviar correo, así que se omite esta comprobación.',
);
const COULD_NOT = t(
  "This couldn't be checked right now.",
  'No se ha podido comprobar ahora mismo.',
);

const ENTRIES: Record<CheckId, Entry> = {
  'https-available': {
    title: t('The site is served over HTTPS', 'La web se sirve por HTTPS'),
    explain: byStatus({
      pass: t(
        'The site answers over an encrypted HTTPS connection.',
        'La web responde por una conexión HTTPS cifrada.',
      ),
      fail: t(
        'No website answered over HTTPS. Visitors would reach nothing, or an unencrypted page.',
        'Ninguna web respondió por HTTPS. Los visitantes no encontrarían nada, o una página sin cifrar.',
      ),
    }),
    fix: () =>
      t(
        "Install a certificate (free with Let's Encrypt) and serve the site on port 443. If this domain has no website on purpose, you can ignore this.",
        "Instala un certificado (gratis con Let's Encrypt) y sirve la web en el puerto 443. Si este dominio no tiene web a propósito, puedes ignorarlo.",
      ),
  },
  'http-redirect': {
    title: t('http:// redirects to https://', 'http:// redirige a https://'),
    explain: byStatus({
      pass: t(
        'Plain http:// addresses are sent to https://{to}.',
        'Las direcciones http:// se envían a https://{to}.',
      ),
      fail: t(
        'Visiting the http:// address does not end on a secure https:// page of the same site.',
        'Entrar por la dirección http:// no termina en una página https:// segura del mismo sitio.',
      ),
      info: t(
        'Nothing answers on plain http:// (port 80), or no website answered, so there is nothing to redirect.',
        'Nada responde por http:// (puerto 80), o no respondió ninguna web, así que no hay nada que redirigir.',
      ),
    }),
    fix: () =>
      t(
        'Add a permanent redirect (301) from http:// to https:// on your server or hosting panel.',
        'Añade una redirección permanente (301) de http:// a https:// en tu servidor o panel de hosting.',
      ),
  },
  'cert-valid': {
    title: t('The certificate is valid', 'El certificado es válido'),
    explain: byStatus({
      pass: t(
        'The certificate is trusted, matches the domain and has not expired.',
        'El certificado es de confianza, coincide con el dominio y no ha caducado.',
      ),
      fail: t(
        "Browsers will warn visitors: the certificate is not trusted, doesn't match the domain or has expired ({error}).",
        'Los navegadores avisarán a los visitantes: el certificado no es de confianza, no coincide con el dominio o ha caducado ({error}).',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        "Issue a new certificate that covers this exact name (for example with Let's Encrypt) and include the full chain.",
        "Emite un certificado nuevo que cubra exactamente este nombre (por ejemplo con Let's Encrypt) e incluye la cadena completa.",
      ),
  },
  'cert-expiry': {
    title: t('The certificate is not about to expire', 'El certificado no está a punto de caducar'),
    explain: byStatus({
      pass: t(
        'The certificate is valid for {days} more days.',
        'El certificado es válido {days} días más.',
      ),
      warn: t(
        'The certificate expires in {days} days. If renewal is not automatic, it needs attention soon.',
        'El certificado caduca en {days} días. Si la renovación no es automática, conviene ocuparse pronto.',
      ),
      fail: t(
        'The certificate expires in {days} days (or already has). Visitors will see a security warning.',
        'El certificado caduca en {days} días (o ya ha caducado). Los visitantes verán una advertencia de seguridad.',
      ),
      info: COULD_NOT,
    }),
    fix: () =>
      t(
        'Renew it now and set up automatic renewal (certbot, your host or your CDN usually does this).',
        'Renuévalo ahora y activa la renovación automática (certbot, tu hosting o tu CDN suelen hacerlo).',
      ),
  },
  'tls-version': {
    title: t('A modern TLS version is used', 'Se usa una versión moderna de TLS'),
    explain: byStatus({
      pass: t('The connection negotiates TLS {version}.', 'La conexión negocia TLS {version}.'),
      fail: t(
        'The server does not offer TLS 1.2 or 1.3 to a modern client (negotiated: {version}).',
        'El servidor no ofrece TLS 1.2 ni 1.3 a un cliente moderno (negociado: {version}).',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Enable TLS 1.2 and 1.3 in your server or CDN settings.',
        'Activa TLS 1.2 y 1.3 en la configuración de tu servidor o CDN.',
      ),
  },
  'tls-legacy': {
    title: t(
      'Old TLS versions are switched off',
      'Las versiones antiguas de TLS están desactivadas',
    ),
    explain: byStatus({
      pass: t('The server refuses TLS 1.0 and 1.1.', 'El servidor rechaza TLS 1.0 y 1.1.'),
      fail: t(
        'The server still accepts TLS {versions}, which are obsolete and have known weaknesses.',
        'El servidor aún acepta TLS {versions}, que están obsoletos y tienen debilidades conocidas.',
      ),
      info: COULD_NOT,
    }),
    fix: () =>
      t(
        'Set the minimum TLS version to 1.2. Nginx: ssl_protocols TLSv1.2 TLSv1.3;',
        'Fija TLS 1.2 como versión mínima. Nginx: ssl_protocols TLSv1.2 TLSv1.3;',
      ),
  },
  'tls-cipher': {
    title: t('A strong cipher is negotiated', 'Se negocia un cifrado fuerte'),
    explain: byStatus({
      pass: t(
        'The negotiated cipher ({cipher}) is not one of the weak families.',
        'El cifrado negociado ({cipher}) no es de las familias débiles.',
      ),
      fail: t(
        'The negotiated cipher ({cipher}) is weak (RC4, 3DES, export or NULL).',
        'El cifrado negociado ({cipher}) es débil (RC4, 3DES, export o NULL).',
      ),
      info: COULD_NOT,
    }),
    fix: () =>
      t(
        'Use a modern cipher list (the "Intermediate" profile of the Mozilla SSL configuration generator).',
        'Usa una lista de cifrados moderna (el perfil "Intermediate" del generador de configuración SSL de Mozilla).',
      ),
  },
  hsts: {
    title: t(
      'HSTS tells browsers to always use HTTPS',
      'HSTS indica a los navegadores que usen siempre HTTPS',
    ),
    explain: byStatus({
      pass: t(
        'Strict-Transport-Security is set (max-age {maxAge} seconds).',
        'Strict-Transport-Security está activado (max-age {maxAge} segundos).',
      ),
      warn: t(
        'Strict-Transport-Security is set but for too short a time ({maxAge} seconds). Six months or more is recommended.',
        'Strict-Transport-Security está activado pero por poco tiempo ({maxAge} segundos). Se recomiendan seis meses o más.',
      ),
      fail: t(
        'There is no Strict-Transport-Security header, so a browser may still try the insecure http:// address first.',
        'No hay cabecera Strict-Transport-Security, así que un navegador aún puede probar primero la dirección http:// insegura.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Send this header on every HTTPS response: Strict-Transport-Security: max-age=31536000; includeSubDomains',
        'Envía esta cabecera en cada respuesta HTTPS: Strict-Transport-Security: max-age=31536000; includeSubDomains',
      ),
  },
  'hsts-subdomains': {
    title: t('HSTS covers subdomains', 'HSTS cubre los subdominios'),
    explain: (_status, values) =>
      values.present
        ? t('The header includes includeSubDomains.', 'La cabecera incluye includeSubDomains.')
        : t(
            'The HSTS header does not include includeSubDomains (or there is no HSTS). For your information.',
            'La cabecera HSTS no incluye includeSubDomains (o no hay HSTS). Solo informativo.',
          ),
  },
  'hsts-preload': {
    title: t('HSTS preload', 'HSTS preload'),
    explain: (_status, values) =>
      values.present
        ? t(
            "The header asks to be in browsers' preload lists.",
            'La cabecera pide estar en las listas de precarga de los navegadores.',
          )
        : t(
            "The site is not marked for browsers' HSTS preload lists. Optional; for your information.",
            'La web no está marcada para las listas de precarga HSTS de los navegadores. Opcional; solo informativo.',
          ),
  },
  'csp-present': {
    title: t('A Content-Security-Policy is set', 'Hay una Content-Security-Policy'),
    explain: byStatus({
      pass: t(
        'The site sends a Content-Security-Policy.',
        'La web envía una Content-Security-Policy.',
      ),
      fail: t(
        'There is no Content-Security-Policy, the main browser defence against injected scripts.',
        'No hay Content-Security-Policy, la principal defensa del navegador contra scripts inyectados.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        "Start with: Content-Security-Policy: default-src 'self'; frame-ancestors 'none' and add the sources your site really needs.",
        "Empieza con: Content-Security-Policy: default-src 'self'; frame-ancestors 'none' y añade los orígenes que tu web necesite de verdad.",
      ),
  },
  'csp-enforced': {
    title: t('The Content-Security-Policy is enforced', 'La Content-Security-Policy se aplica'),
    explain: byStatus({
      pass: t(
        'The policy is enforced, not only reported.',
        'La política se aplica, no solo se reporta.',
      ),
      warn: t(
        'The policy is Report-Only: browsers report violations but do not block anything.',
        'La política es Report-Only: los navegadores informan de las infracciones pero no bloquean nada.',
      ),
      fail: t('There is no policy to enforce.', 'No hay ninguna política que aplicar.'),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'When the reports are clean, switch Content-Security-Policy-Report-Only to Content-Security-Policy.',
        'Cuando los informes salgan limpios, cambia Content-Security-Policy-Report-Only por Content-Security-Policy.',
      ),
  },
  'csp-weak': {
    title: t(
      'The Content-Security-Policy is not weakened',
      'La Content-Security-Policy no está debilitada',
    ),
    explain: byStatus({
      pass: t(
        'No unsafe keywords or wildcard sources were found in the policy.',
        'No se encontraron palabras inseguras ni orígenes comodín en la política.',
      ),
      warn: t(
        'The policy weakens its own protection: {problems}.',
        'La política debilita su propia protección: {problems}.',
      ),
      info: t('There is no policy to assess.', 'No hay política que evaluar.'),
    }),
    fix: () =>
      t(
        "Replace 'unsafe-inline' with nonces or hashes, drop 'unsafe-eval', and list exact sources instead of * or data:.",
        "Sustituye 'unsafe-inline' por nonces o hashes, quita 'unsafe-eval' y lista orígenes concretos en lugar de * o data:.",
      ),
  },
  'frame-protection': {
    title: t('Clickjacking protection', 'Protección contra clickjacking'),
    explain: byStatus({
      pass: t(
        'Other sites cannot show this one inside a frame.',
        'Otras webs no pueden mostrar esta dentro de un marco.',
      ),
      fail: t(
        'Other sites can embed this one in a frame, which enables clickjacking.',
        'Otras webs pueden incrustar esta en un marco, lo que permite el clickjacking.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        "Add Content-Security-Policy: frame-ancestors 'none' (or 'self'), or X-Frame-Options: DENY.",
        "Añade Content-Security-Policy: frame-ancestors 'none' (o 'self'), o X-Frame-Options: DENY.",
      ),
  },
  'x-content-type-options': {
    title: t('X-Content-Type-Options: nosniff', 'X-Content-Type-Options: nosniff'),
    explain: byStatus({
      pass: t(
        'Browsers are told not to guess file types.',
        'Se indica a los navegadores que no adivinen los tipos de archivo.',
      ),
      warn: t(
        'Without nosniff, a browser may treat a file as a different type than declared.',
        'Sin nosniff, un navegador puede tratar un archivo como de un tipo distinto al declarado.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Add the header: X-Content-Type-Options: nosniff',
        'Añade la cabecera: X-Content-Type-Options: nosniff',
      ),
  },
  'referrer-policy': {
    title: t('Referrer-Policy', 'Referrer-Policy'),
    explain: byStatus({
      pass: t(
        'A Referrer-Policy limits what is shared with other sites.',
        'Una Referrer-Policy limita lo que se comparte con otras webs.',
      ),
      warn: t(
        'No (or a permissive) Referrer-Policy: full page addresses may be sent to other sites.',
        'Sin Referrer-Policy (o muy permisiva): las direcciones completas de las páginas pueden enviarse a otras webs.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Add: Referrer-Policy: strict-origin-when-cross-origin',
        'Añade: Referrer-Policy: strict-origin-when-cross-origin',
      ),
  },
  'permissions-policy': {
    title: t('Permissions-Policy', 'Permissions-Policy'),
    explain: byStatus({
      pass: t(
        'A Permissions-Policy restricts powerful browser features.',
        'Una Permissions-Policy restringe funciones potentes del navegador.',
      ),
      warn: t(
        'There is no Permissions-Policy, so embedded content is not restricted from using the camera, microphone or location.',
        'No hay Permissions-Policy, así que el contenido incrustado no tiene restricciones para usar la cámara, el micrófono o la ubicación.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Add, for example: Permissions-Policy: camera=(), microphone=(), geolocation=()',
        'Añade, por ejemplo: Permissions-Policy: camera=(), microphone=(), geolocation=()',
      ),
  },
  coop: {
    title: t('Cross-Origin-Opener-Policy', 'Cross-Origin-Opener-Policy'),
    explain: (_status, values) =>
      values.value
        ? t('Set to {value}.', 'Configurada como {value}.')
        : t(
            'Not set. Optional hardening; for your information.',
            'No está configurada. Refuerzo opcional; solo informativo.',
          ),
  },
  cookies: {
    title: t('Cookies are set safely', 'Las cookies se crean de forma segura'),
    explain: byStatus({
      pass: t(
        'The cookies set by the homepage ({count}) have the right flags.',
        'Las cookies que crea la portada ({count}) tienen las marcas correctas.',
      ),
      warn: t(
        'Some cookies lack flags (Secure or SameSite): {problems}.',
        'A algunas cookies les faltan marcas (Secure o SameSite): {problems}.',
      ),
      fail: t(
        'Session-like cookies lack Secure or HttpOnly, so scripts or insecure connections could read them: {problems}.',
        'Las cookies de sesión no tienen Secure o HttpOnly, así que scripts o conexiones inseguras podrían leerlas: {problems}.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Set cookies with: Set-Cookie: name=value; Secure; HttpOnly; SameSite=Lax',
        'Crea las cookies con: Set-Cookie: nombre=valor; Secure; HttpOnly; SameSite=Lax',
      ),
  },
  'info-leak': {
    title: t('Server details are not revealed', 'No se revelan detalles del servidor'),
    explain: byStatus({
      pass: t(
        'No software names or versions are announced.',
        'No se anuncian nombres ni versiones de software.',
      ),
      warn: t(
        'The site announces exact software versions ({found}), which helps attackers pick known exploits.',
        'La web anuncia versiones exactas de software ({found}), lo que ayuda a los atacantes a elegir fallos conocidos.',
      ),
      info: t(
        'The site names the software it runs ({found}) without a version. Harmless on its own; for your information.',
        'La web indica el software que usa ({found}) sin versión. Inofensivo por sí solo; solo informativo.',
      ),
    }),
    fix: () =>
      t(
        'Hide version numbers: Nginx "server_tokens off;", Apache "ServerTokens Prod", PHP "expose_php = Off".',
        'Oculta los números de versión: Nginx "server_tokens off;", Apache "ServerTokens Prod", PHP "expose_php = Off".',
      ),
  },
  'mixed-content': {
    title: t('No insecure content on the page', 'Sin contenido inseguro en la página'),
    explain: byStatus({
      pass: t(
        'The page loads all its resources over HTTPS.',
        'La página carga todos sus recursos por HTTPS.',
      ),
      warn: t(
        'The page loads images or media over http://: {passive}.',
        'La página carga imágenes o medios por http://: {passive}.',
      ),
      fail: t(
        'The page loads scripts, styles or frames over http://: {active}. Browsers block them and attackers can alter them.',
        'La página carga scripts, estilos o marcos por http://: {active}. Los navegadores los bloquean y un atacante puede modificarlos.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Change those addresses to https:// (or relative paths).',
        'Cambia esas direcciones a https:// (o a rutas relativas).',
      ),
  },
  sri: {
    title: t('Third-party files are integrity-checked', 'Los archivos de terceros se verifican'),
    explain: byStatus({
      pass: t(
        'No third-party script or style is loaded without an integrity check.',
        'Ningún script o estilo de terceros se carga sin verificación de integridad.',
      ),
      warn: t(
        '{count} third-party script or style file(s) from {hosts} load without an integrity attribute: if that host is compromised, so is your site.',
        '{count} archivo(s) de script o estilo de terceros desde {hosts} se cargan sin atributo integrity: si ese servidor se compromete, tu web también.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Add integrity="sha384-…" and crossorigin="anonymous" to those tags, or host the files yourself.',
        'Añade integrity="sha384-…" y crossorigin="anonymous" a esas etiquetas, o aloja tú los archivos.',
      ),
  },
  'vulnerable-libs': {
    title: t('No known-vulnerable libraries', 'Sin librerías con vulnerabilidades conocidas'),
    explain: byStatus({
      pass: t(
        "No known-vulnerable front-end library was recognised in the page's script addresses.",
        'No se reconoció ninguna librería de front-end con vulnerabilidades conocidas en las direcciones de los scripts.',
      ),
      warn: t(
        'Outdated libraries with known issues: {libs}. The version comes from the file name, so it is a hint, not proof.',
        'Librerías desactualizadas con fallos conocidos: {libs}. La versión sale del nombre del archivo, así que es una pista, no una prueba.',
      ),
      fail: t(
        'Libraries with serious known vulnerabilities: {libs}. The version comes from the file name, so it is a hint, not proof.',
        'Librerías con vulnerabilidades graves conocidas: {libs}. La versión sale del nombre del archivo, así que es una pista, no una prueba.',
      ),
      info: t(
        "The vulnerability data (Retire.js) wasn't available, so this couldn't be checked.",
        'Los datos de vulnerabilidades (Retire.js) no estaban disponibles, así que no se pudo comprobar.',
      ),
    }),
    fix: () =>
      t(
        'Update those libraries to the fixed version or later.',
        'Actualiza esas librerías a la versión corregida o posterior.',
      ),
  },
  'form-http': {
    title: t('Forms are submitted securely', 'Los formularios se envían de forma segura'),
    explain: byStatus({
      pass: t(
        'No form sends data over http://, and no password field is on an insecure page.',
        'Ningún formulario envía datos por http:// ni hay un campo de contraseña en una página insegura.',
      ),
      fail: t(
        'A form sends data over http://, or a password field is on a page that is not served over HTTPS. What people type can be read on the way.',
        'Un formulario envía datos por http://, o hay un campo de contraseña en una página que no se sirve por HTTPS. Lo que la gente escribe puede leerse por el camino.',
      ),
      info: NO_WEBSITE,
    }),
    fix: () =>
      t(
        'Serve the page over HTTPS and point every form to an https:// address.',
        'Sirve la página por HTTPS y haz que cada formulario apunte a una dirección https://.',
      ),
  },
  caa: {
    title: t('CAA limits who can issue certificates', 'CAA limita quién puede emitir certificados'),
    explain: byStatus({
      pass: t(
        'CAA records name the authorities allowed to issue certificates.',
        'Los registros CAA indican qué autoridades pueden emitir certificados.',
      ),
      info: t(
        'There is no CAA record, so any authority may issue a certificate for the domain. Optional hardening; for your information.',
        'No hay registro CAA, así que cualquier autoridad puede emitir un certificado para el dominio. Refuerzo opcional; solo informativo.',
      ),
    }),
    fix: () =>
      t(
        'Add a DNS record, for example: 0 issue "letsencrypt.org"',
        'Añade un registro DNS, por ejemplo: 0 issue "letsencrypt.org"',
      ),
  },
  dnssec: {
    title: t("DNSSEC signs the domain's DNS", 'DNSSEC firma el DNS del dominio'),
    explain: byStatus({
      pass: t(
        "A validating resolver confirms the domain's DNS answers are signed.",
        'Un resolvedor que valida confirma que las respuestas DNS del dominio están firmadas.',
      ),
      warn: t(
        "The domain's DNS answers are not validated by DNSSEC, so forged answers can't be detected.",
        'Las respuestas DNS del dominio no se validan con DNSSEC, así que no pueden detectarse respuestas falsificadas.',
      ),
      info: COULD_NOT,
    }),
    fix: () =>
      t(
        'Turn on DNSSEC at your DNS host and add the DS record at your registrar.',
        'Activa DNSSEC en tu proveedor de DNS y añade el registro DS en tu registrador.',
      ),
  },
  mx: {
    title: t('Mail servers (MX)', 'Servidores de correo (MX)'),
    explain: byStatus({
      pass: t(
        'The domain has mail servers (MX) set up.',
        'El dominio tiene servidores de correo (MX) configurados.',
      ),
      warn: t(
        'The domain has email records but no MX record, so it may not receive email.',
        'El dominio tiene registros de correo pero ningún MX, así que puede que no reciba correo.',
      ),
      info: t(
        'This domain seems to send no email, so this check was skipped.',
        'Este dominio parece no enviar correo, así que se omite esta comprobación.',
      ),
    }),
    fix: () =>
      t(
        'Add MX records from your email provider, or an explicit null MX ("0 .") if the domain takes no email.',
        'Añade los MX de tu proveedor de correo, o un MX nulo explícito ("0 .") si el dominio no recibe correo.',
      ),
  },
  spf: {
    title: t('SPF says who may send email', 'SPF indica quién puede enviar correo'),
    explain: (status, values) => {
      if (status === 'info') {
        return t(
          'This domain seems to send no email, so this check was skipped.',
          'Este dominio parece no enviar correo, así que se omite esta comprobación.',
        );
      }
      if (values.reason === 'missing') {
        return t(
          'There is no SPF record, so anyone can pretend to send email from this domain.',
          'No hay registro SPF, así que cualquiera puede hacerse pasar por este dominio al enviar correo.',
        );
      }
      if (values.reason === 'multiple') {
        return t(
          'There is more than one SPF record, which makes SPF invalid.',
          'Hay más de un registro SPF, lo que lo invalida.',
        );
      }
      if (values.reason === 'lookups') {
        return t(
          'The SPF record needs {lookups} DNS lookups; more than 10 makes it invalid.',
          'El registro SPF necesita {lookups} consultas DNS; más de 10 lo invalida.',
        );
      }
      if (status === 'pass') {
        return t(
          'SPF is set and ends in -all: other senders are rejected.',
          'SPF está configurado y termina en -all: se rechaza a otros remitentes.',
        );
      }
      if (status === 'warn') {
        return t(
          'SPF ends in ~all (soft fail): other senders are only marked suspicious.',
          'SPF termina en ~all (soft fail): a otros remitentes solo se les marca como sospechosos.',
        );
      }
      return t(
        'The SPF record does not restrict other senders (it has no -all or ~all).',
        'El registro SPF no restringe a otros remitentes (no tiene -all ni ~all).',
      );
    },
    fix: () =>
      t(
        'Publish a single TXT record, for example: v=spf1 include:_spf.your-provider.com -all (keep it under 10 lookups).',
        'Publica un único registro TXT, por ejemplo: v=spf1 include:_spf.tu-proveedor.com -all (con menos de 10 consultas).',
      ),
  },
  dmarc: {
    title: t('DMARC protects against spoofing', 'DMARC protege contra la suplantación'),
    explain: (status, values) => {
      if (status === 'info') {
        return t(
          'This domain seems to send no email, so this check was skipped.',
          'Este dominio parece no enviar correo, así que se omite esta comprobación.',
        );
      }
      if (status === 'fail') {
        return t(
          'There is no DMARC record, so receivers have no instruction for forged email from your domain.',
          'No hay registro DMARC, así que los receptores no saben qué hacer con correo falso de tu dominio.',
        );
      }
      const reports = values.rua
        ? t('', '')
        : t(
            ' It has no report address (rua), so you would not see abuse.',
            ' No tiene dirección de informes (rua), así que no verías los abusos.',
          );
      if (status === 'pass') {
        return t(
          `DMARC policy is ${String(values.policy)}: forged email is stopped.${reports.en}`,
          `La política DMARC es ${String(values.policy)}: el correo falso se frena.${reports.es}`,
        );
      }
      return t(
        `DMARC is in monitoring mode (p=none): forged email is not stopped.${reports.en}`,
        `DMARC está en modo vigilancia (p=none): el correo falso no se frena.${reports.es}`,
      );
    },
    fix: () =>
      t(
        'Publish a TXT record at _dmarc.<domain>, for example: v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>. Move to p=reject when reports look clean.',
        'Publica un registro TXT en _dmarc.<dominio>, por ejemplo: v=DMARC1; p=quarantine; rua=mailto:dmarc@<dominio>. Pasa a p=reject cuando los informes salgan limpios.',
      ),
  },
  dkim: {
    title: t('DKIM signs outgoing email', 'DKIM firma el correo saliente'),
    explain: (status) =>
      status === 'pass'
        ? t(
            'A DKIM key was found (selector {selectors}).',
            'Se encontró una clave DKIM (selector {selectors}).',
          )
        : t(
            'No DKIM key was found on the common selectors. The real selector can have any name, so this is only for your information.',
            'No se encontró clave DKIM en los selectores habituales. El selector real puede tener cualquier nombre, así que es solo informativo.',
          ),
    fix: () =>
      t(
        'Turn on DKIM signing at your email provider and publish the TXT record it gives you.',
        'Activa la firma DKIM en tu proveedor de correo y publica el registro TXT que te dé.',
      ),
  },
  'mta-sts': {
    title: t(
      'MTA-STS forces encrypted mail delivery',
      'MTA-STS fuerza la entrega de correo cifrada',
    ),
    explain: byStatus({
      pass: t(
        'MTA-STS is in enforce mode: other servers must use encryption to deliver your email.',
        'MTA-STS está en modo enforce: otros servidores deben cifrar para entregar tu correo.',
      ),
      warn: t(
        'MTA-STS is set up but not enforcing (mode {mode}, or its policy file could not be read).',
        'MTA-STS está configurado pero no se aplica (modo {mode}, o no se pudo leer su archivo de política).',
      ),
      info: t(
        'MTA-STS is not set up. Optional hardening for domains that receive email; for your information.',
        'MTA-STS no está configurado. Refuerzo opcional para dominios que reciben correo; solo informativo.',
      ),
    }),
    fix: () =>
      t(
        'Publish a TXT record at _mta-sts.<domain> (v=STSv1; id=…) and a policy file at https://mta-sts.<domain>/.well-known/mta-sts.txt with mode: enforce.',
        'Publica un registro TXT en _mta-sts.<dominio> (v=STSv1; id=…) y un archivo de política en https://mta-sts.<dominio>/.well-known/mta-sts.txt con mode: enforce.',
      ),
  },
  'tls-rpt': {
    title: t(
      'TLS-RPT reports mail delivery problems',
      'TLS-RPT informa de problemas en la entrega de correo',
    ),
    explain: (_status, values) =>
      values.present
        ? t('TLS reporting is set up.', 'Los informes TLS están configurados.')
        : t(
            'No TLS-RPT record. Optional; for your information.',
            'No hay registro TLS-RPT. Opcional; solo informativo.',
          ),
  },
  'security-txt': {
    title: t(
      'security.txt tells researchers how to report problems',
      'security.txt indica a los investigadores cómo avisar de problemas',
    ),
    explain: byStatus({
      pass: t(
        'A valid security.txt gives a contact and an expiry date.',
        'Un security.txt válido indica un contacto y una fecha de caducidad.',
      ),
      warn: t(
        'security.txt exists but is expired or has no Contact line.',
        'security.txt existe pero está caducado o no tiene línea Contact.',
      ),
      info: t(
        'There is no /.well-known/security.txt. Optional, but it helps people report a problem to you; for your information.',
        'No hay /.well-known/security.txt. Opcional, pero ayuda a que te avisen de un problema; solo informativo.',
      ),
    }),
    fix: () =>
      t(
        'Publish https://<domain>/.well-known/security.txt with: Contact: mailto:security@<domain> and Expires: <a date within a year> (see securitytxt.org).',
        'Publica https://<dominio>/.well-known/security.txt con: Contact: mailto:security@<dominio> y Expires: <una fecha dentro de un año> (ver securitytxt.org).',
      ),
  },
};

export const GROUP_NAMES: Record<CheckGroup, Bilingual> = {
  https: t('HTTPS and encryption', 'HTTPS y cifrado'),
  headers: t('Security headers and cookies', 'Cabeceras de seguridad y cookies'),
  page: t('The page', 'La página'),
  'dns-email': t('DNS and email', 'DNS y correo'),
  'security-txt': t('security.txt', 'security.txt'),
};

/** What every report says it is (and isn't), in both languages. */
export const PASSIVE_STATEMENT = t(
  'These are passive checks of what the domain publicly answers. "No issues found in these passive checks" does not mean the site is secure: a passive check cannot see what is behind it (code, servers, accounts).',
  'Son comprobaciones pasivas de lo que el dominio responde públicamente. "Sin problemas en estas comprobaciones pasivas" no significa que la web sea segura: una comprobación pasiva no puede ver lo que hay detrás (código, servidores, cuentas).',
);

function fill(text: string, values: Values): string {
  return text.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) return '-';
    return Array.isArray(value) ? value.join(', ') : String(value);
  });
}

/** A check's title, explanation and fix advice in `locale` (advice only when not a pass). */
export function checkText(
  id: CheckId,
  status: CheckStatus,
  locale: ApiLocale,
  values: Values,
): { title: string; explanation: string; advice: string } {
  const entry = ENTRIES[id];
  // An `info` for a reason that isn't about the check itself reads the same everywhere.
  const generic =
    status !== 'info'
      ? undefined
      : values.reason === 'unknown'
        ? COULD_NOT
        : values.reason === 'no-website'
          ? NO_WEBSITE
          : values.reason === 'no-email'
            ? NO_EMAIL
            : undefined;
  return {
    title: entry.title[locale],
    explanation: fill((generic ?? entry.explain(status, values))[locale], values),
    advice:
      status === 'pass' || generic ? '' : fill(entry.fix?.(status, values)?.[locale] ?? '', values),
  };
}

const FAILURES: Record<string, Bilingual> = {
  'Domain not found': t(
    "The domain doesn't exist or has no DNS records. Check the spelling and try again.",
    'El dominio no existe o no tiene registros DNS. Revisa que esté bien escrito y vuelve a intentarlo.',
  ),
  'Timed out': t(
    'The check took too long to finish. Try again in a few minutes.',
    'La revisión tardó demasiado en terminar. Vuelve a intentarlo en unos minutos.',
  ),
};

/** Why a check failed, in plain words in `locale`. */
export function failureText(error: string, locale: ApiLocale): string {
  return (
    FAILURES[error]?.[locale] ??
    t(
      'The check could not be completed. Try again later.',
      'No se pudo completar la revisión. Vuelve a intentarlo más tarde.',
    )[locale]
  );
}

export const FAILURE_NOT_FOUND = 'Domain not found';
export const FAILURE_TIMEOUT = 'Timed out';
