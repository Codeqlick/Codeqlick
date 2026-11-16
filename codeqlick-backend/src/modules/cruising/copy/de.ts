import type { CruisingCopy } from './types.js';

/** Cruising's emails and push texts in German. */
export const de: CruisingCopy = {
  takedown: {
    receivedSubject: 'Wir haben deinen Entfernungsantrag erhalten',
    receivedTitle: 'Antrag erhalten',
    received:
      'Wir haben deinen Entfernungsantrag für Cruising erhalten. Wenn es um eine minderjährige Person oder etwas Illegales geht (oder, bei einem Foto oder Video, um eine fehlende Einwilligung oder ein gestohlenes Bild) und er zu etwas Veröffentlichtem passt, ist es bereits ausgeblendet. Wir prüfen ihn und antworten innerhalb von 24 Stunden.',
    removedSubject: 'Wir haben den Inhalt entfernt',
    removedTitle: 'Inhalt entfernt',
    removed: 'Wir haben deinen Antrag geprüft und entfernt, worum du gebeten hast.',
    closedSubject: 'Wir haben deinen Entfernungsantrag geprüft',
    closedTitle: 'Antrag geprüft',
    closed: 'Wir haben deinen Antrag geprüft und nichts entfernt.',
    answer: 'Antwort des Teams',
    reference: 'Referenz des Antrags',
  },
  notice: {
    'spot-live': {
      subject: 'Dein Ort ist online',
      body: 'Wir haben einen der Orte geprüft, die du vorgeschlagen hast, und er ist jetzt auf der Karte.',
      button: 'Meine Orte ansehen',
    },
    'spot-rejected': {
      subject: 'Wir haben einen deiner Orte nicht veröffentlicht',
      body: 'Wir haben einen der Orte geprüft, die du vorgeschlagen hast, und ihn nicht veröffentlicht. Der Grund:',
      button: 'Meine Orte ansehen',
    },
    'spot-removed': {
      subject: 'Wir haben einen deiner Orte entfernt',
      body: 'Nach einer Meldung haben wir einen der Orte entfernt, die du vorgeschlagen hast. Die Entfernung ist endgültig. Der Grund:',
      button: 'Meine Orte ansehen',
    },
    suspended: {
      subject: 'Dein Cruising-Konto ist gesperrt',
      body: 'Wir haben dein Cruising-Konto gesperrt. Du kannst weiterhin die Karte ansehen, aber keine Orte vorschlagen, keine Bewertungen schreiben, keine Meldungen senden, nicht einchecken und keine Nachrichten senden.',
      button: 'Regeln lesen',
    },
    unread: {
      subject: 'Du hast eine ungelesene Nachricht',
      body: 'Jemand hat dir in Cruising geschrieben und du hast es noch nicht gelesen.',
      button: 'Nachricht lesen',
    },
    'verification-approved': {
      subject: 'Dein Profil ist verifiziert',
      body: 'Wir haben dein Verifizierungsfoto geprüft: Dein Profil trägt das Abzeichen „Verifiziert“ und du kannst Fotos und Videos hochladen.',
      button: 'Zu meinem Profil',
    },
    'verification-rejected': {
      subject: 'Wir konnten dein Profil nicht verifizieren',
      body: 'Wir haben dein Verifizierungsfoto geprüft und nicht genehmigt. Wir haben das Foto gelöscht. Du kannst ein neues senden. Der Grund:',
      button: 'Zu meinem Profil',
    },
    'verification-withdrawn': {
      subject: 'Dein Profil ist nicht mehr verifiziert',
      body: 'Das Team hat die Verifizierung deines Profils zurückgezogen: Es trägt nicht mehr das Abzeichen „Verifiziert“ und du kannst keine Fotos oder Videos mehr hochladen.',
      button: 'Regeln lesen',
    },
    'media-removed': {
      subject: 'Wir haben eines deiner Fotos oder Videos entfernt',
      body: 'Nach einer Prüfung haben wir ein Foto oder Video aus deinem Profil entfernt; es kann nicht erneut hochgeladen werden. Der Grund:',
      button: 'Zu meinem Profil',
    },
    favorites: {
      subject: 'An deinen Lieblingsorten ist etwas los',
      body: 'An deinen Lieblingsorten ist etwas los.',
      button: 'Meine Favoriten ansehen',
    },
    'meetup-cancelled': {
      subject: 'Ein Treffen wurde abgesagt',
      body: 'Ein Cruising-Treffen, zu dem du zugesagt hattest, wurde abgesagt.',
      button: 'Treffen ansehen',
    },
    reasonTitle: 'Grund',
    until: 'Bis',
    permanent: 'Bis das Team sie aufhebt',
    settings: 'Du kannst diese E-Mail in deinem Cruising-Profil abbestellen.',
  },
  invite: {
    subject: (name) => `${name} bittet dich, die Codeqlick-Sicherheitsalarme zu erhalten`,
    title: 'Codeqlick-Sicherheitsalarme',
    intro: (name) => [
      `${name} möchte, dass du eine seiner Vertrauenspersonen für die Codeqlick-Sicherheitsalarme bist.`,
      `Wenn ${name} sich mit jemandem trifft, kann er einen Sicherheits-Timer starten. Wenn er ihn nicht rechtzeitig beendet, schicken wir dir eine E-Mail mit seiner Nachricht, der Uhrzeit und, falls er ihn teilen möchte, dem Ort, damit du nachsehen kannst, ob alles in Ordnung ist.`,
      'Sonst bekommst du nichts von uns, und du kannst jederzeit aufhören.',
    ],
    button: 'Annehmen oder ablehnen',
    outro: (stopUrl) => [`Diese Alarme jederzeit abbestellen: ${stopUrl}`],
    note: (name) =>
      `Wenn du ${name} nicht kennst oder das nicht möchtest, lehne ab oder ignoriere diese E-Mail: Wir schicken dir dann nichts.`,
  },
  alert: {
    subject: (name) => `Codeqlick-Sicherheitsalarm: ${name} hat sich nicht gemeldet`,
    title: 'Codeqlick-Sicherheitsalarm',
    intro: (name) => [
      `${name} hat einen Sicherheits-Timer gestartet und ihn nicht rechtzeitig beendet. Er hat uns gebeten, dir Bescheid zu geben, damit du nachsehen kannst, ob alles in Ordnung ist.`,
      'Versuche, ihn zu erreichen. Wenn du glaubst, dass er in Gefahr ist, ruf den Notruf an (112 in Europa).',
    ],
    message: 'Seine Nachricht',
    time: 'Abgelaufen um',
    place: 'Ort',
    map: 'Karte',
    button: 'Ort auf einer Karte ansehen',
    outro: (stopUrl) => [`Diese Alarme abbestellen: ${stopUrl}`],
    note: 'Du erhältst diese E-Mail, weil du zugestimmt hast, Vertrauensperson zu sein. Dies ist die einzige E-Mail, die dieser Timer sendet.',
  },
  member: {
    timer: {
      subject: 'Dein Sicherheits-Timer endet in 10 Minuten',
      body: 'Verlängere ihn oder beende ihn, wenn alles in Ordnung ist. Wenn er abläuft, bekommen deine Vertrauenspersonen eine E-Mail.',
      button: 'Meinen Timer öffnen',
    },
    health: {
      subject: 'Zeit für deinen Check-up',
      body: 'Zeit für deinen Check-up.',
      button: 'Eine Teststelle finden',
    },
    settings: 'Du kannst das in deinem Cruising-Profil ändern.',
  },
  safetyPush: {
    timer: 'Dein Sicherheits-Timer endet in 10 Minuten',
    health: 'Zeit für deinen Check-up',
  },
  push: {
    favorite: 'Jemand ist an einem deiner Lieblingsorte',
    message: 'Neue Nachricht',
    meetup: 'An einem deiner Lieblingsorte wurde ein Treffen geplant',
    safety: 'Sicherheitswarnung an einem deiner Lieblingsorte',
    'meetup-cancelled': 'Ein Treffen, dem du beigetreten bist, wurde abgesagt',
    album: 'Jemand hat sein privates Album mit dir geteilt',
    wink: 'Jemand hat dir zugezwinkert',
  },
};
