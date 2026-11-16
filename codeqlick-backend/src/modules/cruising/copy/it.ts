import type { CruisingCopy } from './types.js';

/** Cruising's emails and push texts in Italian. */
export const it: CruisingCopy = {
  takedown: {
    receivedSubject: 'Abbiamo ricevuto la tua richiesta di rimozione',
    receivedTitle: 'Richiesta ricevuta',
    received:
      'Abbiamo ricevuto la tua richiesta di rimozione per Cruising. Se riguarda un minore o qualcosa di illegale (o, per una foto o un video, la mancanza di consenso o un’immagine rubata) e corrisponde a qualcosa di pubblicato, è già nascosto. La esaminiamo e ti rispondiamo entro 24 ore.',
    removedSubject: 'Abbiamo rimosso il contenuto',
    removedTitle: 'Contenuto rimosso',
    removed: 'Abbiamo esaminato la tua richiesta e rimosso ciò che ci hai segnalato.',
    closedSubject: 'Abbiamo esaminato la tua richiesta di rimozione',
    closedTitle: 'Richiesta esaminata',
    closed: 'Abbiamo esaminato la tua richiesta e non abbiamo rimosso nulla.',
    answer: 'La risposta del team',
    reference: 'Riferimento della richiesta',
  },
  notice: {
    'spot-live': {
      subject: 'Il tuo luogo è pubblicato',
      body: 'Abbiamo esaminato uno dei luoghi che hai proposto ed è pubblicato sulla mappa.',
      button: 'Vedi i miei luoghi',
    },
    'spot-rejected': {
      subject: 'Non abbiamo pubblicato uno dei tuoi luoghi',
      body: 'Abbiamo esaminato uno dei luoghi che hai proposto e non l’abbiamo pubblicato. Ecco il motivo:',
      button: 'Vedi i miei luoghi',
    },
    'spot-removed': {
      subject: 'Abbiamo rimosso uno dei tuoi luoghi',
      body: 'In seguito a una segnalazione, abbiamo rimosso uno dei luoghi che hai proposto. La rimozione è definitiva. Ecco il motivo:',
      button: 'Vedi i miei luoghi',
    },
    suspended: {
      subject: 'Il tuo account Cruising è sospeso',
      body: 'Abbiamo sospeso il tuo account Cruising. Puoi ancora consultare la mappa, ma non proporre luoghi, scrivere recensioni, inviare segnalazioni, segnalare la tua presenza né inviare messaggi.',
      button: 'Leggi le regole',
    },
    unread: {
      subject: 'Hai un messaggio non letto',
      body: 'Qualcuno ti ha scritto su Cruising e non l’hai ancora letto.',
      button: 'Leggi il messaggio',
    },
    'verification-approved': {
      subject: 'Il tuo profilo è verificato',
      body: 'Abbiamo esaminato la tua foto di verifica: il tuo profilo ha il badge «Verificato» e puoi caricare foto e video.',
      button: 'Vai al mio profilo',
    },
    'verification-rejected': {
      subject: 'Non abbiamo potuto verificare il tuo profilo',
      body: 'Abbiamo esaminato la tua foto di verifica e non l’abbiamo approvata. Abbiamo eliminato la foto. Puoi inviarne un’altra. Ecco il motivo:',
      button: 'Vai al mio profilo',
    },
    'verification-withdrawn': {
      subject: 'Il tuo profilo non è più verificato',
      body: 'Il team ha revocato la verifica del tuo profilo: non ha più il badge «Verificato» e non puoi più caricare foto o video.',
      button: 'Leggi le regole',
    },
    'media-removed': {
      subject: 'Abbiamo rimosso una delle tue foto o dei tuoi video',
      body: 'Dopo averlo esaminato, abbiamo rimosso una foto o un video dal tuo profilo, e non può essere caricato di nuovo. Ecco il motivo:',
      button: 'Vai al mio profilo',
    },
    favorites: {
      subject: 'C’è movimento nei tuoi luoghi preferiti',
      body: 'C’è movimento nei tuoi luoghi preferiti.',
      button: 'Vedi i miei preferiti',
    },
    'meetup-cancelled': {
      subject: 'Un incontro è stato annullato',
      body: 'Un incontro di Cruising a cui avevi detto di partecipare è stato annullato.',
      button: 'Vedi gli incontri',
    },
    reasonTitle: 'Motivo',
    until: 'Fino al',
    permanent: 'Finché il team non la revoca',
    settings: 'Puoi disattivare questa e-mail nel tuo profilo Cruising.',
  },
  invite: {
    subject: (name) => `${name} ti ha chiesto di ricevere i suoi avvisi di sicurezza Codeqlick`,
    title: 'Avvisi di sicurezza Codeqlick',
    intro: (name) => [
      `${name} vorrebbe che tu fossi uno dei suoi contatti di fiducia per gli avvisi di sicurezza Codeqlick.`,
      `Quando ${name} esce per incontrare qualcuno, può avviare un timer di sicurezza. Se non lo termina in tempo, ti inviamo per e-mail il suo messaggio, l’ora e, se sceglie di condividerlo, il luogo, così puoi verificare che stia bene.`,
      'Non riceverai nient’altro da noi e puoi smettere in qualsiasi momento.',
    ],
    button: 'Accetta o rifiuta',
    outro: (stopUrl) => [`Interrompi questi avvisi in qualsiasi momento: ${stopUrl}`],
    note: (name) =>
      `Se non conosci ${name} o non vuoi riceverli, rifiuta o ignora questa e-mail: non ti verrà inviato nulla.`,
  },
  alert: {
    subject: (name) => `Avviso di sicurezza Codeqlick: ${name} non ha dato notizie`,
    title: 'Avviso di sicurezza Codeqlick',
    intro: (name) => [
      `${name} ha avviato un timer di sicurezza e non l’ha terminato in tempo. Ci ha chiesto di avvisarti, così puoi verificare che stia bene.`,
      'Prova a contattarlo. Se pensi che sia in pericolo, chiama i servizi di emergenza (112 in Europa).',
    ],
    message: 'Il suo messaggio',
    time: 'Scaduto alle',
    place: 'Luogo',
    map: 'Mappa',
    button: 'Vedi il luogo su una mappa',
    outro: (stopUrl) => [`Interrompi questi avvisi: ${stopUrl}`],
    note: 'Ricevi questa e-mail perché hai accettato di essere un contatto di fiducia. È l’unica e-mail che invia questo timer.',
  },
  member: {
    timer: {
      subject: 'Il tuo timer di sicurezza termina tra 10 minuti',
      body: 'Prolungalo o terminalo se stai bene. Se scade, i tuoi contatti di fiducia ricevono un’e-mail.',
      button: 'Apri il mio timer',
    },
    health: {
      subject: 'È ora del tuo controllo',
      body: 'È ora del tuo controllo.',
      button: 'Trova un centro per i test',
    },
    settings: 'Puoi modificarlo nel tuo profilo Cruising.',
  },
  safetyPush: {
    timer: 'Il tuo timer di sicurezza termina tra 10 minuti',
    health: 'È ora del tuo controllo',
  },
  push: {
    favorite: 'Qualcuno è in uno dei tuoi luoghi preferiti',
    message: 'Nuovo messaggio',
    meetup: 'È stato organizzato un incontro in uno dei tuoi luoghi preferiti',
    safety: 'Avviso di sicurezza in uno dei tuoi luoghi preferiti',
    'meetup-cancelled': 'Un incontro a cui partecipavi è stato annullato',
    album: 'Qualcuno ha condiviso con te il suo album privato',
    wink: 'Qualcuno ti ha fatto l’occhiolino',
  },
};
