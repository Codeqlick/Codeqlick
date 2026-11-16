import type { CruisingCopy } from './types.js';

/** Cruising's emails and push texts in Spanish. */
export const es: CruisingCopy = {
  takedown: {
    receivedSubject: 'Hemos recibido tu solicitud de retirada',
    receivedTitle: 'Solicitud recibida',
    received:
      'Hemos recibido tu solicitud de retirada de Cruising. Si se trata de un menor o de algo ilegal (o, para una foto o un vídeo, de falta de consentimiento o de una imagen robada) y coincide con algo publicado, ya está oculto. La revisamos y te respondemos en 24 horas como máximo.',
    removedSubject: 'Hemos retirado el contenido',
    removedTitle: 'Contenido retirado',
    removed: 'Hemos revisado tu solicitud y retirado lo que pedías.',
    closedSubject: 'Hemos revisado tu solicitud de retirada',
    closedTitle: 'Solicitud revisada',
    closed: 'Hemos revisado tu solicitud y no hemos retirado nada.',
    answer: 'Respuesta del equipo',
    reference: 'Referencia de la solicitud',
  },
  notice: {
    'spot-live': {
      subject: 'Tu lugar ya está publicado',
      body: 'Hemos revisado uno de los lugares que propusiste y ya está publicado en el mapa.',
      button: 'Ver mis lugares',
    },
    'spot-rejected': {
      subject: 'No hemos publicado uno de tus lugares',
      body: 'Hemos revisado uno de los lugares que propusiste y no lo hemos publicado. Este es el motivo:',
      button: 'Ver mis lugares',
    },
    'spot-removed': {
      subject: 'Hemos retirado uno de tus lugares',
      body: 'Tras una denuncia, hemos retirado uno de los lugares que propusiste. La retirada es definitiva. Este es el motivo:',
      button: 'Ver mis lugares',
    },
    suspended: {
      subject: 'Tu cuenta de Cruising está suspendida',
      body: 'Hemos suspendido tu cuenta de Cruising. Puedes seguir consultando el mapa, pero no proponer lugares, escribir opiniones, enviar denuncias, marcar que estás en un lugar ni enviar mensajes.',
      button: 'Leer las normas',
    },
    unread: {
      subject: 'Tienes un mensaje sin leer',
      body: 'Alguien te ha escrito en Cruising y aún no lo has leído.',
      button: 'Leer el mensaje',
    },
    'verification-approved': {
      subject: 'Tu perfil está verificado',
      body: 'Hemos revisado tu foto de verificación: tu perfil lleva la insignia «Verificado» y ya puedes subir fotos y vídeos.',
      button: 'Ir a mi perfil',
    },
    'verification-rejected': {
      subject: 'No hemos podido verificar tu perfil',
      body: 'Hemos revisado tu foto de verificación y no la hemos aprobado. Hemos borrado la foto. Puedes enviar otra. Este es el motivo:',
      button: 'Ir a mi perfil',
    },
    'verification-withdrawn': {
      subject: 'Tu perfil ya no está verificado',
      body: 'El equipo ha retirado la verificación de tu perfil: ya no lleva la insignia «Verificado» ni puedes subir fotos o vídeos.',
      button: 'Leer las normas',
    },
    'media-removed': {
      subject: 'Hemos retirado una de tus fotos o vídeos',
      body: 'Tras revisarla, hemos retirado una foto o un vídeo de tu perfil y no se puede volver a subir. Este es el motivo:',
      button: 'Ir a mi perfil',
    },
    favorites: {
      subject: 'Hay actividad en tus lugares favoritos',
      body: 'Hay actividad en tus lugares favoritos.',
      button: 'Ver mis favoritos',
    },
    'meetup-cancelled': {
      subject: 'Se ha cancelado una quedada',
      body: 'Se ha cancelado una quedada de Cruising a la que ibas.',
      button: 'Ver las quedadas',
    },
    reasonTitle: 'Motivo',
    until: 'Hasta',
    permanent: 'Hasta que el equipo la levante',
    settings: 'Puedes dejar de recibir este aviso en tu perfil de Cruising.',
  },
  invite: {
    subject: (name) => `${name} te pide recibir sus alertas de seguridad de Codeqlick`,
    title: 'Alertas de seguridad de Codeqlick',
    intro: (name) => [
      `A ${name} le gustaría que fueras uno de sus contactos de confianza para las alertas de seguridad de Codeqlick.`,
      `Cuando ${name} queda con alguien, puede activar un temporizador de seguridad. Si no lo termina a tiempo, te enviamos un email con su mensaje, la hora y, si decide compartirlo, el lugar, para que compruebes que está bien.`,
      'No recibirás nada más de nuestra parte y puedes dejarlo cuando quieras.',
    ],
    button: 'Aceptar o rechazar',
    outro: (stopUrl) => [`Deja de recibir estas alertas cuando quieras: ${stopUrl}`],
    note: (name) =>
      `Si no conoces a ${name} o no quieres recibirlas, recházalo o ignora este email: no te enviaremos nada.`,
  },
  alert: {
    subject: (name) => `Alerta de seguridad de Codeqlick: ${name} no ha confirmado que está bien`,
    title: 'Alerta de seguridad de Codeqlick',
    intro: (name) => [
      `${name} activó un temporizador de seguridad y no lo terminó a tiempo. Nos pidió que te avisáramos para que compruebes que está bien.`,
      'Intenta contactar con esa persona. Si crees que está en peligro, llama a los servicios de emergencia (112 en Europa).',
    ],
    message: 'Su mensaje',
    time: 'Terminó a las',
    place: 'Lugar',
    map: 'Mapa',
    button: 'Ver el lugar en un mapa',
    outro: (stopUrl) => [`Dejar de recibir estas alertas: ${stopUrl}`],
    note: 'Lo recibes porque aceptaste ser contacto de confianza. Es el único email que envía este temporizador.',
  },
  member: {
    timer: {
      subject: 'Tu temporizador de seguridad termina en 10 minutos',
      body: 'Amplíalo o termínalo si estás bien. Si se agota, tus contactos de confianza recibirán un email.',
      button: 'Abrir mi temporizador',
    },
    health: {
      subject: 'Es hora de tu revisión',
      body: 'Es hora de tu revisión.',
      button: 'Buscar un centro de pruebas',
    },
    settings: 'Puedes cambiarlo en tu perfil de Cruising.',
  },
  safetyPush: {
    timer: 'Tu temporizador de seguridad termina en 10 minutos',
    health: 'Es hora de tu revisión',
  },
  push: {
    favorite: 'Hay alguien en uno de tus lugares favoritos',
    message: 'Mensaje nuevo',
    meetup: 'Se ha organizado una quedada en uno de tus lugares favoritos',
    safety: 'Alerta de seguridad en uno de tus lugares favoritos',
    'meetup-cancelled': 'Se ha cancelado una quedada a la que ibas',
    album: 'Alguien ha compartido contigo su álbum privado',
    wink: 'Alguien te ha guiñado un ojo',
  },
};
