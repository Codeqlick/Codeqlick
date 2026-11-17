import type { AppLocale } from '@/i18n/routing';

/**
 * Neoqlick's own legal texts (architecture 4.18, decision 129): the legal notice, the privacy
 * policy of the account and the terms of use of the account, in the six languages of its portal.
 * A section is [heading, body]; `{owner}` is the operator's details list, `{mail}` the contact
 * address. The apps' own terms and privacy policies (Cruising, Swipe, Videochat) are separate.
 */
export type NeoqlickDoc = {
  title: string;
  description: string;
  sections: [heading: string, body: string][];
};

export type NeoqlickTexts = {
  updated: string;
  owner: { owner: string; taxId: string; address: string; email: string; website: string };
  legal: NeoqlickDoc;
  privacy: NeoqlickDoc;
  terms: NeoqlickDoc;
};

const en: NeoqlickTexts = {
  updated: '17 November 2026',
  owner: {
    owner: 'Owner',
    taxId: 'Tax ID',
    address: 'Address',
    email: 'Email',
    website: 'Website',
  },
  legal: {
    title: 'Legal notice',
    description: 'Who is responsible for Neoqlick and the conditions of use of this website.',
    sections: [
      [
        'Owner',
        'As required by article 10 of Spanish Law 34/2002 on information society services and e-commerce (LSSI-CE), these are the details of the person responsible for this website:\n\n{owner}\n\nNeoqlick is the trade name under which its owner offers Cruising, Swipe and Videochat. It is not a company.',
      ],
      [
        'Purpose',
        'This website presents Neoqlick’s apps, which are for adults only (18+), and the legal texts that apply to them. There is no contact form and no sales: the way to reach us is email.',
      ],
      [
        'Conditions of use',
        'By browsing the website you agree to use it in good faith and in accordance with the law. You may not try to access private areas without authorisation, interfere with how it works or use its contents for unlawful purposes.',
      ],
      [
        'Intellectual property',
        'The texts, design, logo and code of this website belong to its owner or are used under licence. You may quote or link to the contents stating their origin; for any other use, write to us first. Names and brands of third parties belong to their owners.',
      ],
      [
        'Liability',
        'We take care that the information is correct and up to date, but we cannot guarantee that it contains no errors. The website may link to third-party pages over whose contents we have no control.',
      ],
      [
        'Applicable law',
        'These conditions are governed by Spanish law. If you have any question, write to {mail}.',
      ],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    description:
      'How Neoqlick handles the data of your account: what we keep, why, for how long and your rights.',
    sections: [
      [
        'Who is responsible',
        'The controller of the data of your Neoqlick account is:\n\n{owner}\n\nThis policy covers the account and this website. Each app (Cruising, Swipe, Videochat) has its own privacy policy for what you do in it.',
      ],
      [
        'What we keep',
        '- **Account:** your email, your password (only as a hash that cannot be reversed), your optional username and the version of the terms you accepted and when.\n- **Sessions and security:** the devices that are signed in (browser, approximate time and IP address), sign-in attempts and the security events of your account, so we can protect it and show you where it is open.\n- **Passkeys and two-step verification:** the public part of each passkey and the data the second step needs.\n- **Your age:** you tell us you are 18 or older when you sign up; each app asks for what it needs to let you in.',
      ],
      [
        'Why and on what basis',
        'To create and run your account (performance of the terms you accept), to keep it and the apps secure and prevent abuse (our legitimate interest, article 6.1.f GDPR) and to comply with the law when it requires it.',
      ],
      [
        'Cookies and storage',
        'We only use the cookies the account needs to work: the session cookies (httpOnly, only for the host you are on, never shared between hosts) and a short-lived one while signing in. There are no advertising or tracking cookies on this website; its visit statistics are cookieless and anonymous. The apps with ads (Swipe, Videochat) say what their ad provider does in their own policies.',
      ],
      [
        'How long',
        'Your account data lasts as long as the account does. Sessions end when they expire or when you sign out; security records are kept for a limited time and then deleted. When you delete your account, we delete it together with your data in the apps.',
      ],
      [
        'Who receives the data',
        'We do not sell data. The processors we use are OVHcloud (hosting and email) and Cloudflare (the Turnstile check that tells people from bots when you sign up or in). They act on our instructions.',
      ],
      [
        'Your rights',
        'You can access, correct, download and delete your data from your account settings (data export and account deletion), and you can object to or limit its processing by writing to {mail}. You may also complain to the Spanish data protection agency (aepd.es).',
      ],
      [
        'Adults only',
        'Neoqlick is for people aged 18 or older. If we find out that an account belongs to a minor, we close it and delete its data.',
      ],
    ],
  },
  terms: {
    title: 'Terms of use',
    description:
      'The conditions of the Neoqlick account that gives access to Cruising, Swipe and Videochat.',
    sections: [
      [
        'Who may use Neoqlick',
        'Neoqlick is only for adults. You must be 18 or older to create an account or use any of its apps, and by signing up you confirm that you are.',
      ],
      [
        'Your account',
        'One person, one account. Give a real email address you can read, choose a strong password (a passkey and two-step verification make it safer) and keep your sign-in details to yourself. You are responsible for what happens with your account. If you think someone else has access to it, change your password and sign out everywhere from your account settings.',
      ],
      [
        'How you behave',
        'Treat people with respect. Do not use Neoqlick for anything illegal, to harass anyone, to impersonate someone, to publish content involving minors or content shared without consent, or to send spam. Each app has its own rules, which you accept the first time you enter it, and they apply on top of these terms.',
      ],
      [
        'Suspension and closing',
        'If you break these terms or the rules of an app, we may limit or suspend your access, in all the apps when the reason is serious. You can delete your account at any time from your account settings.',
      ],
      [
        'The apps',
        'Cruising, Swipe and Videochat are offered as they are, free of charge and without guarantees of availability. We may change or stop them; when a change affects you, we will tell you in advance whenever we can.',
      ],
      [
        'Liability',
        'Within what the law allows, we are not liable for what members do or for losses that were not foreseeable when you accepted these terms. Nothing here limits the rights that the law gives you as a consumer.',
      ],
      [
        'Changes and law',
        'When these terms change in a way that matters, we publish a new version and ask you to accept it. They are governed by Spanish law. Questions: {mail}.',
      ],
    ],
  },
};

const es: NeoqlickTexts = {
  updated: '17 de noviembre de 2026',
  owner: {
    owner: 'Titular',
    taxId: 'NIF',
    address: 'Dirección',
    email: 'Correo electrónico',
    website: 'Sitio web',
  },
  legal: {
    title: 'Aviso legal',
    description: 'Quién es el responsable de Neoqlick y las condiciones de uso de este sitio web.',
    sections: [
      [
        'Datos del titular',
        'En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), estos son los datos del responsable de este sitio web:\n\n{owner}\n\nNeoqlick es el nombre comercial con el que su titular ofrece Cruising, Swipe y Videochat. No es una sociedad mercantil.',
      ],
      [
        'Objeto',
        'Este sitio presenta las apps de Neoqlick, solo para adultos (+18), y los textos legales que les aplican. No hay formulario de contacto ni ventas: la forma de contactar con nosotros es el correo electrónico.',
      ],
      [
        'Condiciones de uso',
        'Al navegar por el sitio aceptas usarlo de buena fe y de acuerdo con la ley. No está permitido intentar acceder a áreas privadas sin autorización, alterar su funcionamiento ni usar sus contenidos con fines ilícitos.',
      ],
      [
        'Propiedad intelectual',
        'Los textos, el diseño, el logotipo y el código de este sitio pertenecen a su titular o se usan con licencia. Puedes citar o enlazar los contenidos indicando su origen; para cualquier otro uso, escríbenos antes. Los nombres y marcas de terceros pertenecen a sus respectivos propietarios.',
      ],
      [
        'Responsabilidad',
        'Cuidamos que la información publicada sea correcta y esté al día, pero no podemos garantizar que no contenga errores. El sitio puede enlazar a páginas de terceros, sobre cuyos contenidos no tenemos control.',
      ],
      [
        'Legislación aplicable',
        'Estas condiciones se rigen por la legislación española. Si tienes cualquier duda, escríbenos a {mail}.',
      ],
    ],
  },
  privacy: {
    title: 'Política de privacidad',
    description:
      'Cómo trata Neoqlick los datos de tu cuenta: qué guardamos, para qué, durante cuánto tiempo y tus derechos.',
    sections: [
      [
        'Quién es el responsable',
        'El responsable del tratamiento de los datos de tu cuenta de Neoqlick es:\n\n{owner}\n\nEsta política cubre la cuenta y este sitio web. Cada app (Cruising, Swipe, Videochat) tiene su propia política de privacidad para lo que haces en ella.',
      ],
      [
        'Qué guardamos',
        '- **Cuenta:** tu correo electrónico, tu contraseña (solo como un hash que no se puede revertir), tu nombre de usuario opcional y la versión de las condiciones que aceptaste y cuándo.\n- **Sesiones y seguridad:** los dispositivos con la sesión iniciada (navegador, hora aproximada y dirección IP), los intentos de inicio de sesión y los eventos de seguridad de tu cuenta, para protegerla y mostrarte dónde está abierta.\n- **Passkeys y verificación en dos pasos:** la parte pública de cada passkey y los datos que necesita el segundo paso.\n- **Tu edad:** al registrarte nos dices que tienes 18 años o más; cada app pide lo que necesita para dejarte entrar.',
      ],
      [
        'Para qué y con qué base',
        'Para crear y mantener tu cuenta (ejecución de las condiciones que aceptas), para mantenerla a ella y a las apps seguras y evitar abusos (nuestro interés legítimo, artículo 6.1.f RGPD) y para cumplir la ley cuando lo exige.',
      ],
      [
        'Cookies y almacenamiento',
        'Solo usamos las cookies que la cuenta necesita para funcionar: las de sesión (httpOnly, solo para el sitio en el que estás, nunca compartidas entre sitios) y una de corta duración al iniciar sesión. No hay cookies publicitarias ni de seguimiento en este sitio web; sus estadísticas de visitas no usan cookies y son anónimas. Las apps con anuncios (Swipe, Videochat) explican en sus propias políticas lo que hace su proveedor de publicidad.',
      ],
      [
        'Durante cuánto tiempo',
        'Los datos de tu cuenta duran lo que dure la cuenta. Las sesiones terminan cuando caducan o cuando cierras sesión; los registros de seguridad se guardan un tiempo limitado y luego se borran. Cuando eliminas tu cuenta, la borramos junto con tus datos en las apps.',
      ],
      [
        'Quién recibe los datos',
        'No vendemos datos. Los encargados del tratamiento que usamos son OVHcloud (alojamiento y correo) y Cloudflare (la comprobación Turnstile que distingue personas de bots al registrarte o iniciar sesión). Actúan siguiendo nuestras instrucciones.',
      ],
      [
        'Tus derechos',
        'Puedes acceder a tus datos, corregirlos, descargarlos y borrarlos desde los ajustes de tu cuenta (exportación de datos y eliminación de la cuenta), y puedes oponerte a su tratamiento o pedir su limitación escribiendo a {mail}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).',
      ],
      [
        'Solo para adultos',
        'Neoqlick es para personas de 18 años o más. Si descubrimos que una cuenta pertenece a un menor, la cerramos y borramos sus datos.',
      ],
    ],
  },
  terms: {
    title: 'Condiciones de uso',
    description:
      'Las condiciones de la cuenta de Neoqlick que da acceso a Cruising, Swipe y Videochat.',
    sections: [
      [
        'Quién puede usar Neoqlick',
        'Neoqlick es solo para adultos. Debes tener 18 años o más para crear una cuenta o usar cualquiera de sus apps, y al registrarte confirmas que los tienes.',
      ],
      [
        'Tu cuenta',
        'Una persona, una cuenta. Da un correo real que puedas leer, elige una contraseña fuerte (una passkey y la verificación en dos pasos la hacen más segura) y no compartas tus datos de acceso. Eres responsable de lo que ocurra con tu cuenta. Si crees que otra persona tiene acceso a ella, cambia la contraseña y cierra sesión en todas partes desde los ajustes de tu cuenta.',
      ],
      [
        'Cómo te comportas',
        'Trata a las personas con respeto. No uses Neoqlick para nada ilegal, para acosar a nadie, para suplantar a alguien, para publicar contenido que implique a menores o que se comparta sin consentimiento, ni para enviar spam. Cada app tiene sus propias reglas, que aceptas la primera vez que entras, y se aplican además de estas condiciones.',
      ],
      [
        'Suspensión y cierre',
        'Si incumples estas condiciones o las reglas de una app, podemos limitar o suspender tu acceso, en todas las apps cuando el motivo es grave. Puedes eliminar tu cuenta en cualquier momento desde los ajustes de tu cuenta.',
      ],
      [
        'Las apps',
        'Cruising, Swipe y Videochat se ofrecen tal cual, gratis y sin garantías de disponibilidad. Podemos cambiarlas o dejar de ofrecerlas; cuando un cambio te afecte, te avisaremos con antelación siempre que podamos.',
      ],
      [
        'Responsabilidad',
        'Dentro de lo que permite la ley, no respondemos de lo que hagan los miembros ni de pérdidas que no fueran previsibles cuando aceptaste estas condiciones. Nada de lo aquí escrito limita los derechos que la ley te da como consumidor.',
      ],
      [
        'Cambios y legislación',
        'Cuando estas condiciones cambien de forma relevante, publicaremos una versión nueva y te pediremos que la aceptes. Se rigen por la legislación española. Dudas: {mail}.',
      ],
    ],
  },
};

const fr: NeoqlickTexts = {
  updated: '17 novembre 2026',
  owner: {
    owner: 'Responsable',
    taxId: 'N° fiscal',
    address: 'Adresse',
    email: 'E-mail',
    website: 'Site web',
  },
  legal: {
    title: 'Mentions légales',
    description: 'Qui est responsable de Neoqlick et les conditions d’utilisation de ce site.',
    sections: [
      [
        'Responsable',
        'Conformément à l’article 10 de la loi espagnole 34/2002 sur les services de la société de l’information et le commerce électronique (LSSI-CE), voici les coordonnées du responsable de ce site :\n\n{owner}\n\nNeoqlick est le nom commercial sous lequel son titulaire propose Cruising, Swipe et Videochat. Ce n’est pas une société.',
      ],
      [
        'Objet',
        'Ce site présente les applications de Neoqlick, réservées aux adultes (18+), et les textes juridiques qui s’y appliquent. Il n’y a ni formulaire de contact ni vente : pour nous joindre, écrivez-nous par e-mail.',
      ],
      [
        'Conditions d’utilisation',
        'En naviguant sur le site, vous acceptez de l’utiliser de bonne foi et dans le respect de la loi. Il est interdit d’essayer d’accéder sans autorisation à des espaces privés, de perturber son fonctionnement ou d’en utiliser les contenus à des fins illicites.',
      ],
      [
        'Propriété intellectuelle',
        'Les textes, le design, le logo et le code de ce site appartiennent à son titulaire ou sont utilisés sous licence. Vous pouvez citer ou lier les contenus en indiquant leur origine ; pour tout autre usage, écrivez-nous d’abord. Les noms et marques de tiers appartiennent à leurs propriétaires.',
      ],
      [
        'Responsabilité',
        'Nous veillons à ce que les informations soient exactes et à jour, mais nous ne pouvons garantir l’absence d’erreurs. Le site peut renvoyer vers des pages de tiers dont nous ne maîtrisons pas le contenu.',
      ],
      [
        'Droit applicable',
        'Ces conditions sont régies par le droit espagnol. Pour toute question, écrivez à {mail}.',
      ],
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    description:
      'Comment Neoqlick traite les données de votre compte : ce que nous conservons, pourquoi, combien de temps et vos droits.',
    sections: [
      [
        'Qui est responsable',
        'Le responsable du traitement des données de votre compte Neoqlick est :\n\n{owner}\n\nCette politique couvre le compte et ce site. Chaque application (Cruising, Swipe, Videochat) a sa propre politique de confidentialité pour ce que vous y faites.',
      ],
      [
        'Ce que nous conservons',
        '- **Compte :** votre e-mail, votre mot de passe (uniquement sous forme de hachage irréversible), votre nom d’utilisateur facultatif et la version des conditions acceptée, avec la date.\n- **Sessions et sécurité :** les appareils connectés (navigateur, heure approximative et adresse IP), les tentatives de connexion et les événements de sécurité de votre compte, pour le protéger et vous montrer où il est ouvert.\n- **Passkeys et vérification en deux étapes :** la partie publique de chaque passkey et les données nécessaires à la seconde étape.\n- **Votre âge :** à l’inscription, vous indiquez avoir 18 ans ou plus ; chaque application demande ce dont elle a besoin pour vous laisser entrer.',
      ],
      [
        'Pourquoi et sur quelle base',
        'Pour créer et faire fonctionner votre compte (exécution des conditions que vous acceptez), pour le protéger ainsi que les applications et prévenir les abus (notre intérêt légitime, article 6.1.f du RGPD) et pour respecter la loi lorsqu’elle l’exige.',
      ],
      [
        'Cookies et stockage',
        'Nous n’utilisons que les cookies nécessaires au fonctionnement du compte : les cookies de session (httpOnly, propres à l’hôte où vous vous trouvez, jamais partagés entre hôtes) et un cookie de courte durée pendant la connexion. Il n’y a ni cookie publicitaire ni cookie de suivi sur ce site ; ses statistiques de visite n’utilisent pas de cookies et sont anonymes. Les applications avec publicité (Swipe, Videochat) précisent dans leurs propres politiques ce que fait leur fournisseur de publicité.',
      ],
      [
        'Combien de temps',
        'Les données de votre compte durent autant que le compte. Les sessions se terminent à leur expiration ou à votre déconnexion ; les journaux de sécurité sont conservés pour une durée limitée puis supprimés. Lorsque vous supprimez votre compte, nous le supprimons avec vos données dans les applications.',
      ],
      [
        'Qui reçoit les données',
        'Nous ne vendons pas de données. Nos sous-traitants sont OVHcloud (hébergement et e-mail) et Cloudflare (la vérification Turnstile qui distingue les personnes des robots à l’inscription et à la connexion). Ils agissent selon nos instructions.',
      ],
      [
        'Vos droits',
        'Vous pouvez accéder à vos données, les corriger, les télécharger et les supprimer depuis les paramètres de votre compte (export des données et suppression du compte), et vous opposer à leur traitement ou en demander la limitation en écrivant à {mail}. Vous pouvez aussi introduire une réclamation auprès de l’autorité espagnole de protection des données (aepd.es) ou de votre autorité nationale.',
      ],
      [
        'Réservé aux adultes',
        'Neoqlick est réservé aux personnes de 18 ans ou plus. Si nous découvrons qu’un compte appartient à un mineur, nous le fermons et supprimons ses données.',
      ],
    ],
  },
  terms: {
    title: 'Conditions d’utilisation',
    description:
      'Les conditions du compte Neoqlick qui donne accès à Cruising, Swipe et Videochat.',
    sections: [
      [
        'Qui peut utiliser Neoqlick',
        'Neoqlick est réservé aux adultes. Vous devez avoir 18 ans ou plus pour créer un compte ou utiliser l’une de ses applications, et en vous inscrivant vous confirmez que c’est le cas.',
      ],
      [
        'Votre compte',
        'Une personne, un compte. Indiquez une adresse e-mail réelle que vous pouvez lire, choisissez un mot de passe solide (une passkey et la vérification en deux étapes le renforcent) et gardez vos identifiants pour vous. Vous êtes responsable de ce qui se passe avec votre compte. Si vous pensez que quelqu’un d’autre y a accès, changez votre mot de passe et déconnectez-vous partout depuis les paramètres de votre compte.',
      ],
      [
        'Votre comportement',
        'Respectez les autres. N’utilisez pas Neoqlick pour quoi que ce soit d’illégal, pour harceler quiconque, usurper une identité, publier des contenus impliquant des mineurs ou partagés sans consentement, ni pour envoyer du spam. Chaque application a ses propres règles, que vous acceptez à votre première entrée, et elles s’ajoutent à ces conditions.',
      ],
      [
        'Suspension et fermeture',
        'Si vous ne respectez pas ces conditions ou les règles d’une application, nous pouvons limiter ou suspendre votre accès, dans toutes les applications lorsque le motif est grave. Vous pouvez supprimer votre compte à tout moment depuis ses paramètres.',
      ],
      [
        'Les applications',
        'Cruising, Swipe et Videochat sont proposées en l’état, gratuitement et sans garantie de disponibilité. Nous pouvons les modifier ou les arrêter ; lorsqu’un changement vous concerne, nous vous prévenons à l’avance chaque fois que possible.',
      ],
      [
        'Responsabilité',
        'Dans les limites de la loi, nous ne sommes pas responsables de ce que font les membres ni des pertes qui n’étaient pas prévisibles lorsque vous avez accepté ces conditions. Rien ici ne limite les droits que la loi vous accorde en tant que consommateur.',
      ],
      [
        'Modifications et droit applicable',
        'Lorsque ces conditions changent de façon importante, nous publions une nouvelle version et vous demandons de l’accepter. Elles sont régies par le droit espagnol. Questions : {mail}.',
      ],
    ],
  },
};

const de: NeoqlickTexts = {
  updated: '17. November 2026',
  owner: {
    owner: 'Verantwortlicher',
    taxId: 'Steuernummer',
    address: 'Adresse',
    email: 'E-Mail',
    website: 'Website',
  },
  legal: {
    title: 'Impressum',
    description: 'Wer für Neoqlick verantwortlich ist und die Nutzungsbedingungen dieser Website.',
    sections: [
      [
        'Anbieter',
        'Gemäß Artikel 10 des spanischen Gesetzes 34/2002 über Dienste der Informationsgesellschaft und den elektronischen Geschäftsverkehr (LSSI-CE) sind dies die Angaben zum Verantwortlichen dieser Website:\n\n{owner}\n\nNeoqlick ist der Handelsname, unter dem der Inhaber Cruising, Swipe und Videochat anbietet. Es ist kein Unternehmen.',
      ],
      [
        'Zweck',
        'Diese Website stellt die Apps von Neoqlick vor, die nur für Erwachsene (18+) bestimmt sind, sowie die rechtlichen Texte, die für sie gelten. Es gibt kein Kontaktformular und keinen Verkauf: Du erreichst uns per E-Mail.',
      ],
      [
        'Nutzungsbedingungen',
        'Mit der Nutzung der Website erklärst du dich bereit, sie nach Treu und Glauben und gesetzeskonform zu nutzen. Es ist nicht erlaubt, unbefugt auf private Bereiche zuzugreifen, ihren Betrieb zu stören oder ihre Inhalte für rechtswidrige Zwecke zu verwenden.',
      ],
      [
        'Geistiges Eigentum',
        'Die Texte, das Design, das Logo und der Code dieser Website gehören dem Inhaber oder werden lizenziert genutzt. Du darfst Inhalte unter Angabe der Quelle zitieren oder verlinken; für jede andere Nutzung schreib uns bitte vorher. Namen und Marken Dritter gehören ihren jeweiligen Inhabern.',
      ],
      [
        'Haftung',
        'Wir achten darauf, dass die Informationen richtig und aktuell sind, können aber nicht garantieren, dass sie fehlerfrei sind. Die Website kann auf Seiten Dritter verweisen, auf deren Inhalte wir keinen Einfluss haben.',
      ],
      [
        'Anwendbares Recht',
        'Diese Bedingungen unterliegen spanischem Recht. Bei Fragen schreib an {mail}.',
      ],
    ],
  },
  privacy: {
    title: 'Datenschutzerklärung',
    description:
      'Wie Neoqlick die Daten deines Kontos verarbeitet: was wir speichern, warum, wie lange und deine Rechte.',
    sections: [
      [
        'Wer verantwortlich ist',
        'Verantwortlich für die Verarbeitung der Daten deines Neoqlick-Kontos ist:\n\n{owner}\n\nDiese Erklärung gilt für das Konto und diese Website. Jede App (Cruising, Swipe, Videochat) hat eine eigene Datenschutzerklärung für das, was du darin tust.',
      ],
      [
        'Was wir speichern',
        '- **Konto:** deine E-Mail-Adresse, dein Passwort (nur als nicht umkehrbarer Hash), dein optionaler Benutzername sowie die Version der akzeptierten Bedingungen und der Zeitpunkt.\n- **Sitzungen und Sicherheit:** die angemeldeten Geräte (Browser, ungefähre Zeit und IP-Adresse), Anmeldeversuche und Sicherheitsereignisse deines Kontos, damit wir es schützen und dir zeigen können, wo es angemeldet ist.\n- **Passkeys und Zwei-Schritt-Bestätigung:** der öffentliche Teil jedes Passkeys und die Daten, die der zweite Schritt braucht.\n- **Dein Alter:** bei der Registrierung bestätigst du, dass du mindestens 18 bist; jede App fragt, was sie für den Zutritt braucht.',
      ],
      [
        'Wozu und auf welcher Grundlage',
        'Um dein Konto anzulegen und zu betreiben (Erfüllung der Bedingungen, denen du zustimmst), um es und die Apps zu schützen und Missbrauch zu verhindern (unser berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO) und um gesetzliche Pflichten zu erfüllen.',
      ],
      [
        'Cookies und Speicher',
        'Wir verwenden nur die Cookies, die das Konto zum Funktionieren braucht: die Sitzungs-Cookies (httpOnly, nur für den jeweiligen Host, nie zwischen Hosts geteilt) und ein kurzlebiges Cookie während der Anmeldung. Auf dieser Website gibt es keine Werbe- oder Tracking-Cookies; ihre Besucherstatistik arbeitet ohne Cookies und anonym. Die Apps mit Werbung (Swipe, Videochat) erklären in ihren eigenen Erklärungen, was ihr Werbeanbieter tut.',
      ],
      [
        'Wie lange',
        'Die Daten deines Kontos bleiben so lange bestehen wie das Konto. Sitzungen enden, wenn sie ablaufen oder du dich abmeldest; Sicherheitsprotokolle werden begrenzte Zeit aufbewahrt und dann gelöscht. Wenn du dein Konto löschst, löschen wir es zusammen mit deinen Daten in den Apps.',
      ],
      [
        'Wer die Daten erhält',
        'Wir verkaufen keine Daten. Unsere Auftragsverarbeiter sind OVHcloud (Hosting und E-Mail) und Cloudflare (die Turnstile-Prüfung, die bei Registrierung und Anmeldung Menschen von Bots unterscheidet). Sie handeln nach unseren Weisungen.',
      ],
      [
        'Deine Rechte',
        'In den Einstellungen deines Kontos kannst du deine Daten einsehen, berichtigen, herunterladen und löschen (Datenexport und Kontolöschung). Der Verarbeitung kannst du widersprechen oder ihre Einschränkung verlangen, indem du an {mail} schreibst. Du kannst dich auch bei der spanischen Datenschutzbehörde (aepd.es) oder deiner zuständigen Aufsichtsbehörde beschweren.',
      ],
      [
        'Nur für Erwachsene',
        'Neoqlick ist für Personen ab 18 Jahren. Wenn wir feststellen, dass ein Konto einer minderjährigen Person gehört, schließen wir es und löschen seine Daten.',
      ],
    ],
  },
  terms: {
    title: 'Nutzungsbedingungen',
    description:
      'Die Bedingungen des Neoqlick-Kontos, das Zugang zu Cruising, Swipe und Videochat gibt.',
    sections: [
      [
        'Wer Neoqlick nutzen darf',
        'Neoqlick ist nur für Erwachsene. Du musst mindestens 18 Jahre alt sein, um ein Konto anzulegen oder eine der Apps zu nutzen, und mit der Registrierung bestätigst du das.',
      ],
      [
        'Dein Konto',
        'Eine Person, ein Konto. Gib eine echte E-Mail-Adresse an, die du lesen kannst, wähle ein starkes Passwort (ein Passkey und die Zwei-Schritt-Bestätigung machen es sicherer) und behalte deine Zugangsdaten für dich. Du bist für das verantwortlich, was mit deinem Konto geschieht. Wenn du glaubst, dass jemand anderes Zugriff hat, ändere dein Passwort und melde dich in den Kontoeinstellungen überall ab.',
      ],
      [
        'Wie du dich verhältst',
        'Behandle andere mit Respekt. Nutze Neoqlick nicht für Rechtswidriges, nicht um jemanden zu belästigen oder sich als jemand anderes auszugeben, nicht für Inhalte mit Minderjährigen oder ohne Einwilligung geteilte Inhalte und nicht für Spam. Jede App hat eigene Regeln, die du beim ersten Betreten akzeptierst und die zusätzlich zu diesen Bedingungen gelten.',
      ],
      [
        'Sperrung und Schließung',
        'Wenn du gegen diese Bedingungen oder die Regeln einer App verstößt, können wir deinen Zugang einschränken oder sperren, bei schwerwiegenden Gründen in allen Apps. Du kannst dein Konto jederzeit in den Kontoeinstellungen löschen.',
      ],
      [
        'Die Apps',
        'Cruising, Swipe und Videochat werden wie besehen, kostenlos und ohne Verfügbarkeitsgarantie angeboten. Wir können sie ändern oder einstellen; wenn dich eine Änderung betrifft, informieren wir dich nach Möglichkeit vorher.',
      ],
      [
        'Haftung',
        'Im Rahmen des gesetzlich Zulässigen haften wir nicht für das Verhalten von Mitgliedern oder für Schäden, die bei deiner Zustimmung zu diesen Bedingungen nicht vorhersehbar waren. Nichts hier schränkt deine gesetzlichen Verbraucherrechte ein.',
      ],
      [
        'Änderungen und Recht',
        'Wenn sich diese Bedingungen wesentlich ändern, veröffentlichen wir eine neue Version und bitten dich, sie zu akzeptieren. Es gilt spanisches Recht. Fragen: {mail}.',
      ],
    ],
  },
};

const it: NeoqlickTexts = {
  updated: '17 novembre 2026',
  owner: {
    owner: 'Titolare',
    taxId: 'Codice fiscale',
    address: 'Indirizzo',
    email: 'Email',
    website: 'Sito web',
  },
  legal: {
    title: 'Note legali',
    description: 'Chi è responsabile di Neoqlick e le condizioni d’uso di questo sito.',
    sections: [
      [
        'Titolare',
        'Ai sensi dell’articolo 10 della legge spagnola 34/2002 sui servizi della società dell’informazione e il commercio elettronico (LSSI-CE), questi sono i dati del responsabile di questo sito:\n\n{owner}\n\nNeoqlick è il nome commerciale con cui il titolare offre Cruising, Swipe e Videochat. Non è una società.',
      ],
      [
        'Oggetto',
        'Questo sito presenta le app di Neoqlick, riservate agli adulti (18+), e i testi legali che le riguardano. Non ci sono moduli di contatto né vendite: per contattarci basta scrivere un’email.',
      ],
      [
        'Condizioni d’uso',
        'Navigando sul sito accetti di usarlo in buona fede e nel rispetto della legge. Non è consentito cercare di accedere ad aree private senza autorizzazione, alterarne il funzionamento o usarne i contenuti per scopi illeciti.',
      ],
      [
        'Proprietà intellettuale',
        'I testi, il design, il logo e il codice di questo sito appartengono al titolare o sono usati su licenza. Puoi citare o collegare i contenuti indicandone la fonte; per qualsiasi altro uso, scrivici prima. I nomi e i marchi di terzi appartengono ai rispettivi proprietari.',
      ],
      [
        'Responsabilità',
        'Ci impegniamo a mantenere le informazioni corrette e aggiornate, ma non possiamo garantire che siano prive di errori. Il sito può rimandare a pagine di terzi sui cui contenuti non abbiamo alcun controllo.',
      ],
      [
        'Legge applicabile',
        'Queste condizioni sono regolate dalla legge spagnola. Per qualsiasi dubbio scrivi a {mail}.',
      ],
    ],
  },
  privacy: {
    title: 'Informativa sulla privacy',
    description:
      'Come Neoqlick tratta i dati del tuo account: cosa conserviamo, perché, per quanto tempo e i tuoi diritti.',
    sections: [
      [
        'Chi è il responsabile',
        'Il titolare del trattamento dei dati del tuo account Neoqlick è:\n\n{owner}\n\nQuesta informativa riguarda l’account e questo sito. Ogni app (Cruising, Swipe, Videochat) ha una propria informativa per ciò che fai al suo interno.',
      ],
      [
        'Cosa conserviamo',
        '- **Account:** la tua email, la tua password (solo come hash non reversibile), il tuo nome utente facoltativo e la versione delle condizioni accettate con la data.\n- **Sessioni e sicurezza:** i dispositivi con la sessione aperta (browser, orario approssimativo e indirizzo IP), i tentativi di accesso e gli eventi di sicurezza del tuo account, per proteggerlo e mostrarti dove è aperto.\n- **Passkey e verifica in due passaggi:** la parte pubblica di ogni passkey e i dati necessari al secondo passaggio.\n- **La tua età:** al momento della registrazione dichiari di avere almeno 18 anni; ogni app chiede ciò che le serve per farti entrare.',
      ],
      [
        'Perché e su quale base',
        'Per creare e gestire il tuo account (esecuzione delle condizioni che accetti), per proteggere l’account e le app e prevenire abusi (nostro legittimo interesse, articolo 6.1.f GDPR) e per rispettare la legge quando lo richiede.',
      ],
      [
        'Cookie e archiviazione',
        'Usiamo solo i cookie necessari al funzionamento dell’account: quelli di sessione (httpOnly, solo per l’host in cui ti trovi, mai condivisi tra host) e uno di breve durata durante l’accesso. Su questo sito non ci sono cookie pubblicitari né di tracciamento; le sue statistiche di visita non usano cookie e sono anonime. Le app con pubblicità (Swipe, Videochat) spiegano nelle proprie informative cosa fa il loro fornitore pubblicitario.',
      ],
      [
        'Per quanto tempo',
        'I dati del tuo account durano quanto l’account. Le sessioni terminano alla scadenza o quando esci; i registri di sicurezza si conservano per un tempo limitato e poi si eliminano. Quando elimini l’account, lo cancelliamo insieme ai tuoi dati nelle app.',
      ],
      [
        'Chi riceve i dati',
        'Non vendiamo dati. I responsabili del trattamento che usiamo sono OVHcloud (hosting ed email) e Cloudflare (il controllo Turnstile che distingue le persone dai bot in registrazione e accesso). Agiscono secondo le nostre istruzioni.',
      ],
      [
        'I tuoi diritti',
        'Dalle impostazioni dell’account puoi accedere ai tuoi dati, correggerli, scaricarli ed eliminarli (esportazione dei dati ed eliminazione dell’account), e puoi opporti al trattamento o chiederne la limitazione scrivendo a {mail}. Puoi anche presentare reclamo all’autorità spagnola per la protezione dei dati (aepd.es) o al Garante italiano.',
      ],
      [
        'Solo per adulti',
        'Neoqlick è per persone di almeno 18 anni. Se scopriamo che un account appartiene a un minore, lo chiudiamo ed eliminiamo i suoi dati.',
      ],
    ],
  },
  terms: {
    title: 'Condizioni d’uso',
    description:
      'Le condizioni dell’account Neoqlick che dà accesso a Cruising, Swipe e Videochat.',
    sections: [
      [
        'Chi può usare Neoqlick',
        'Neoqlick è solo per adulti. Devi avere almeno 18 anni per creare un account o usare una delle sue app, e registrandoti confermi di averli.',
      ],
      [
        'Il tuo account',
        'Una persona, un account. Indica un’email reale che puoi leggere, scegli una password robusta (una passkey e la verifica in due passaggi la rendono più sicura) e non condividere le tue credenziali. Sei responsabile di ciò che accade con il tuo account. Se pensi che qualcun altro vi abbia accesso, cambia la password ed esci ovunque dalle impostazioni dell’account.',
      ],
      [
        'Come ti comporti',
        'Tratta le persone con rispetto. Non usare Neoqlick per attività illegali, per molestare qualcuno, per fingerti un’altra persona, per pubblicare contenuti che riguardano minori o condivisi senza consenso, né per inviare spam. Ogni app ha regole proprie, che accetti la prima volta che entri e che si applicano in aggiunta a queste condizioni.',
      ],
      [
        'Sospensione e chiusura',
        'Se violi queste condizioni o le regole di un’app, possiamo limitare o sospendere il tuo accesso, in tutte le app quando il motivo è grave. Puoi eliminare l’account in qualsiasi momento dalle sue impostazioni.',
      ],
      [
        'Le app',
        'Cruising, Swipe e Videochat sono offerte così come sono, gratuitamente e senza garanzie di disponibilità. Possiamo modificarle o interromperle; quando una modifica ti riguarda, ti avvisiamo in anticipo ogni volta che possibile.',
      ],
      [
        'Responsabilità',
        'Nei limiti consentiti dalla legge, non rispondiamo di ciò che fanno i membri né di perdite non prevedibili quando hai accettato queste condizioni. Nulla qui limita i diritti che la legge ti riconosce come consumatore.',
      ],
      [
        'Modifiche e legge',
        'Quando queste condizioni cambiano in modo rilevante, pubblichiamo una nuova versione e ti chiediamo di accettarla. Sono regolate dalla legge spagnola. Domande: {mail}.',
      ],
    ],
  },
};

const pt: NeoqlickTexts = {
  updated: '17 de novembro de 2026',
  owner: {
    owner: 'Titular',
    taxId: 'NIF',
    address: 'Morada',
    email: 'E-mail',
    website: 'Sítio web',
  },
  legal: {
    title: 'Aviso legal',
    description: 'Quem é responsável pela Neoqlick e as condições de utilização deste sítio.',
    sections: [
      [
        'Titular',
        'Em cumprimento do artigo 10.º da Lei espanhola 34/2002, relativa aos serviços da sociedade da informação e ao comércio eletrónico (LSSI-CE), estes são os dados do responsável por este sítio:\n\n{owner}\n\nNeoqlick é o nome comercial com que o seu titular oferece o Cruising, o Swipe e o Videochat. Não é uma sociedade.',
      ],
      [
        'Objeto',
        'Este sítio apresenta as aplicações da Neoqlick, só para adultos (18+), e os textos legais que lhes são aplicáveis. Não há formulário de contacto nem vendas: a forma de nos contactar é o e-mail.',
      ],
      [
        'Condições de utilização',
        'Ao navegares no sítio aceitas usá-lo de boa-fé e de acordo com a lei. Não é permitido tentar aceder a áreas privadas sem autorização, alterar o seu funcionamento nem usar os seus conteúdos para fins ilícitos.',
      ],
      [
        'Propriedade intelectual',
        'Os textos, o design, o logótipo e o código deste sítio pertencem ao seu titular ou são usados com licença. Podes citar ou ligar os conteúdos indicando a origem; para qualquer outro uso, escreve-nos antes. Os nomes e marcas de terceiros pertencem aos respetivos proprietários.',
      ],
      [
        'Responsabilidade',
        'Cuidamos para que a informação seja correta e esteja atualizada, mas não podemos garantir que não tenha erros. O sítio pode ligar a páginas de terceiros, sobre cujos conteúdos não temos controlo.',
      ],
      [
        'Legislação aplicável',
        'Estas condições regem-se pela legislação espanhola. Se tiveres qualquer dúvida, escreve para {mail}.',
      ],
    ],
  },
  privacy: {
    title: 'Política de privacidade',
    description:
      'Como a Neoqlick trata os dados da tua conta: o que guardamos, para quê, durante quanto tempo e os teus direitos.',
    sections: [
      [
        'Quem é o responsável',
        'O responsável pelo tratamento dos dados da tua conta Neoqlick é:\n\n{owner}\n\nEsta política abrange a conta e este sítio. Cada aplicação (Cruising, Swipe, Videochat) tem a sua própria política de privacidade para o que fazes nela.',
      ],
      [
        'O que guardamos',
        '- **Conta:** o teu e-mail, a tua palavra-passe (apenas como um hash irreversível), o teu nome de utilizador opcional e a versão dos termos que aceitaste e quando.\n- **Sessões e segurança:** os dispositivos com sessão iniciada (navegador, hora aproximada e endereço IP), as tentativas de início de sessão e os eventos de segurança da tua conta, para a proteger e te mostrar onde está aberta.\n- **Passkeys e verificação em dois passos:** a parte pública de cada passkey e os dados de que o segundo passo precisa.\n- **A tua idade:** ao registares-te indicas que tens 18 anos ou mais; cada aplicação pede o que precisa para te deixar entrar.',
      ],
      [
        'Para quê e com que base',
        'Para criar e manter a tua conta (execução dos termos que aceitas), para a manter, e às aplicações, seguras e evitar abusos (o nosso interesse legítimo, artigo 6.º, n.º 1, alínea f, do RGPD) e para cumprir a lei quando o exige.',
      ],
      [
        'Cookies e armazenamento',
        'Só usamos os cookies de que a conta precisa para funcionar: os de sessão (httpOnly, apenas para o sítio em que estás, nunca partilhados entre sítios) e um de curta duração durante o início de sessão. Neste sítio não há cookies publicitários nem de seguimento; as suas estatísticas de visitas não usam cookies e são anónimas. As aplicações com anúncios (Swipe, Videochat) explicam nas suas próprias políticas o que faz o seu fornecedor de publicidade.',
      ],
      [
        'Durante quanto tempo',
        'Os dados da tua conta duram enquanto a conta existir. As sessões terminam quando expiram ou quando sais; os registos de segurança guardam-se durante um tempo limitado e depois são apagados. Quando eliminas a conta, apagamo-la juntamente com os teus dados nas aplicações.',
      ],
      [
        'Quem recebe os dados',
        'Não vendemos dados. Os subcontratantes que usamos são a OVHcloud (alojamento e e-mail) e a Cloudflare (a verificação Turnstile que distingue pessoas de bots ao registares-te ou iniciares sessão). Atuam segundo as nossas instruções.',
      ],
      [
        'Os teus direitos',
        'Podes aceder aos teus dados, corrigi-los, descarregá-los e apagá-los nas definições da tua conta (exportação de dados e eliminação da conta), e podes opor-te ao tratamento ou pedir a sua limitação escrevendo para {mail}. Podes também apresentar queixa à Agência Espanhola de Proteção de Dados (aepd.es) ou à CNPD.',
      ],
      [
        'Só para adultos',
        'A Neoqlick é para pessoas com 18 anos ou mais. Se descobrirmos que uma conta pertence a um menor, fechamo-la e apagamos os seus dados.',
      ],
    ],
  },
  terms: {
    title: 'Termos de utilização',
    description:
      'As condições da conta Neoqlick que dá acesso ao Cruising, ao Swipe e ao Videochat.',
    sections: [
      [
        'Quem pode usar a Neoqlick',
        'A Neoqlick é só para adultos. Tens de ter 18 anos ou mais para criar uma conta ou usar qualquer uma das suas aplicações, e ao registares-te confirmas que os tens.',
      ],
      [
        'A tua conta',
        'Uma pessoa, uma conta. Indica um e-mail real que possas ler, escolhe uma palavra-passe forte (uma passkey e a verificação em dois passos tornam-na mais segura) e não partilhes os teus dados de acesso. És responsável pelo que acontece com a tua conta. Se achas que outra pessoa tem acesso a ela, muda a palavra-passe e termina a sessão em todo o lado nas definições da conta.',
      ],
      [
        'Como te comportas',
        'Trata as pessoas com respeito. Não uses a Neoqlick para nada ilegal, para assediar ninguém, para te fazeres passar por outra pessoa, para publicar conteúdo que envolva menores ou partilhado sem consentimento, nem para enviar spam. Cada aplicação tem as suas regras, que aceitas na primeira vez que entras e que se aplicam além destes termos.',
      ],
      [
        'Suspensão e encerramento',
        'Se incumprires estes termos ou as regras de uma aplicação, podemos limitar ou suspender o teu acesso, em todas as aplicações quando o motivo é grave. Podes eliminar a tua conta a qualquer momento nas definições.',
      ],
      [
        'As aplicações',
        'O Cruising, o Swipe e o Videochat são oferecidos tal como estão, gratuitamente e sem garantias de disponibilidade. Podemos alterá-los ou deixar de os oferecer; quando uma alteração te afetar, avisamos com antecedência sempre que pudermos.',
      ],
      [
        'Responsabilidade',
        'Dentro do que a lei permite, não respondemos pelo que os membros fazem nem por perdas que não eram previsíveis quando aceitaste estes termos. Nada aqui limita os direitos que a lei te dá como consumidor.',
      ],
      [
        'Alterações e legislação',
        'Quando estes termos mudarem de forma relevante, publicamos uma nova versão e pedimos-te que a aceites. Regem-se pela legislação espanhola. Dúvidas: {mail}.',
      ],
    ],
  },
};

export const NEOQLICK_TEXTS: Record<AppLocale, NeoqlickTexts> = { en, es, fr, de, it, pt };
