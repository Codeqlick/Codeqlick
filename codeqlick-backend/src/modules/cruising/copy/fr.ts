import type { CruisingCopy } from './types.js';

/** Cruising's emails and push texts in French. */
export const fr: CruisingCopy = {
  takedown: {
    receivedSubject: 'Nous avons reçu ta demande de retrait',
    receivedTitle: 'Demande reçue',
    received:
      'Nous avons reçu ta demande de retrait pour Cruising. Si elle concerne un mineur ou quelque chose d’illégal (ou, pour une photo ou une vidéo, un consentement manquant ou une image volée) et qu’elle correspond à un contenu publié, celui-ci est déjà masqué. Nous l’examinons et te répondons dans les 24 heures.',
    removedSubject: 'Nous avons retiré le contenu',
    removedTitle: 'Contenu retiré',
    removed: 'Nous avons examiné ta demande et retiré ce que tu nous as signalé.',
    closedSubject: 'Nous avons examiné ta demande de retrait',
    closedTitle: 'Demande examinée',
    closed: 'Nous avons examiné ta demande et n’avons rien retiré.',
    answer: 'La réponse de l’équipe',
    reference: 'Référence de la demande',
  },
  notice: {
    'spot-live': {
      subject: 'Ton lieu est en ligne',
      body: 'Nous avons examiné l’un des lieux que tu as proposés et il est en ligne sur la carte.',
      button: 'Voir mes lieux',
    },
    'spot-rejected': {
      subject: 'Nous n’avons pas publié l’un de tes lieux',
      body: 'Nous avons examiné l’un des lieux que tu as proposés et ne l’avons pas publié. Voici pourquoi :',
      button: 'Voir mes lieux',
    },
    'spot-removed': {
      subject: 'Nous avons retiré l’un de tes lieux',
      body: 'Suite à un signalement, nous avons retiré l’un des lieux que tu as proposés. Ce retrait est définitif. Voici pourquoi :',
      button: 'Voir mes lieux',
    },
    suspended: {
      subject: 'Ton compte Cruising est suspendu',
      body: 'Nous avons suspendu ton compte Cruising. Tu peux toujours consulter la carte, mais pas proposer de lieux, écrire d’avis, faire de signalements, signaler ta présence ni envoyer de messages.',
      button: 'Lire les règles',
    },
    unread: {
      subject: 'Tu as un message non lu',
      body: 'Quelqu’un t’a écrit sur Cruising et tu ne l’as pas encore lu.',
      button: 'Lire le message',
    },
    'verification-approved': {
      subject: 'Ton profil est vérifié',
      body: 'Nous avons examiné ta photo de vérification : ton profil porte le badge « Vérifié » et tu peux publier des photos et des vidéos.',
      button: 'Aller à mon profil',
    },
    'verification-rejected': {
      subject: 'Nous n’avons pas pu vérifier ton profil',
      body: 'Nous avons examiné ta photo de vérification et ne l’avons pas approuvée. Nous avons supprimé la photo. Tu peux en envoyer une autre. Voici pourquoi :',
      button: 'Aller à mon profil',
    },
    'verification-withdrawn': {
      subject: 'Ton profil n’est plus vérifié',
      body: 'L’équipe a retiré la vérification de ton profil : il ne porte plus le badge « Vérifié » et tu ne peux plus publier de photos ni de vidéos.',
      button: 'Lire les règles',
    },
    'media-removed': {
      subject: 'Nous avons retiré l’une de tes photos ou vidéos',
      body: 'Après examen, nous avons retiré une photo ou une vidéo de ton profil, et elle ne pourra pas être publiée à nouveau. Voici pourquoi :',
      button: 'Aller à mon profil',
    },
    favorites: {
      subject: 'Il y a de l’activité dans tes lieux favoris',
      body: 'Il y a de l’activité dans tes lieux favoris.',
      button: 'Voir mes favoris',
    },
    'meetup-cancelled': {
      subject: 'Une rencontre a été annulée',
      body: 'Une rencontre Cruising à laquelle tu avais dit participer a été annulée.',
      button: 'Voir les rencontres',
    },
    reasonTitle: 'Motif',
    until: 'Jusqu’au',
    permanent: 'Jusqu’à ce que l’équipe la lève',
    settings: 'Tu peux désactiver cet e-mail dans ton profil Cruising.',
  },
  invite: {
    subject: (name) => `${name} t’a demandé de recevoir ses alertes de sécurité Codeqlick`,
    title: 'Alertes de sécurité Codeqlick',
    intro: (name) => [
      `${name} aimerait que tu sois l’un de ses contacts de confiance pour les alertes de sécurité Codeqlick.`,
      `Quand ${name} sort rencontrer quelqu’un, il peut lancer un minuteur de sécurité. S’il ne l’arrête pas à temps, nous t’envoyons par e-mail son message, l’heure et, s’il choisit de le partager, le lieu, pour que tu puisses vérifier qu’il va bien.`,
      'Tu ne recevras rien d’autre de notre part, et tu peux arrêter à tout moment.',
    ],
    button: 'Accepter ou refuser',
    outro: (stopUrl) => [`Arrête ces alertes à tout moment : ${stopUrl}`],
    note: (name) =>
      `Si tu ne connais pas ${name} ou si tu ne le souhaites pas, refuse ou ignore cet e-mail : rien ne te sera envoyé.`,
  },
  alert: {
    subject: (name) => `Alerte de sécurité Codeqlick : ${name} ne s’est pas manifesté`,
    title: 'Alerte de sécurité Codeqlick',
    intro: (name) => [
      `${name} a lancé un minuteur de sécurité et ne l’a pas arrêté à temps. Il nous a demandé de te prévenir, pour que tu puisses vérifier qu’il va bien.`,
      'Essaie de le joindre. Si tu penses qu’il est en danger, appelle les services d’urgence (112 en Europe).',
    ],
    message: 'Son message',
    time: 'Expiré à',
    place: 'Lieu',
    map: 'Carte',
    button: 'Voir le lieu sur une carte',
    outro: (stopUrl) => [`Arrêter ces alertes : ${stopUrl}`],
    note: 'Tu reçois cet e-mail parce que tu as accepté d’être un contact de confiance. C’est le seul e-mail que ce minuteur envoie.',
  },
  member: {
    timer: {
      subject: 'Ton minuteur de sécurité se termine dans 10 minutes',
      body: 'Prolonge-le ou arrête-le si tout va bien. S’il expire, tes contacts de confiance recevront un e-mail.',
      button: 'Ouvrir mon minuteur',
    },
    health: {
      subject: 'C’est l’heure de ton dépistage',
      body: 'C’est l’heure de ton dépistage.',
      button: 'Trouver un centre de dépistage',
    },
    settings: 'Tu peux modifier cela dans ton profil Cruising.',
  },
  safetyPush: {
    timer: 'Ton minuteur de sécurité se termine dans 10 minutes',
    health: 'C’est l’heure de ton dépistage',
  },
  push: {
    favorite: 'Quelqu’un est dans l’un de tes lieux favoris',
    message: 'Nouveau message',
    meetup: 'Une rencontre a été prévue dans l’un de tes lieux favoris',
    safety: 'Alerte de sécurité dans l’un de tes lieux favoris',
    'meetup-cancelled': 'Une rencontre à laquelle tu participais a été annulée',
    album: 'Quelqu’un a partagé son album privé avec toi',
    wink: 'Quelqu’un t’a fait un clin d’œil',
  },
};
