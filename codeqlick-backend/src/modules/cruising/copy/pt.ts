import type { CruisingCopy } from './types.js';

/** Cruising's emails and push texts in Portuguese. */
export const pt: CruisingCopy = {
  takedown: {
    receivedSubject: 'Recebemos o teu pedido de remoção',
    receivedTitle: 'Pedido recebido',
    received:
      'Recebemos o teu pedido de remoção para o Cruising. Se se tratar de um menor ou de algo ilegal (ou, no caso de uma foto ou vídeo, de falta de consentimento ou de uma imagem roubada) e corresponder a algo publicado, já está oculto. Vamos revê-lo e responder no prazo de 24 horas.',
    removedSubject: 'Removemos o conteúdo',
    removedTitle: 'Conteúdo removido',
    removed: 'Revimos o teu pedido e removemos o que nos indicaste.',
    closedSubject: 'Revimos o teu pedido de remoção',
    closedTitle: 'Pedido revisto',
    closed: 'Revimos o teu pedido e não removemos nada.',
    answer: 'A resposta da equipa',
    reference: 'Referência do pedido',
  },
  notice: {
    'spot-live': {
      subject: 'O teu local já está publicado',
      body: 'Revimos um dos locais que propuseste e já está publicado no mapa.',
      button: 'Ver os meus locais',
    },
    'spot-rejected': {
      subject: 'Não publicámos um dos teus locais',
      body: 'Revimos um dos locais que propuseste e não o publicámos. Este é o motivo:',
      button: 'Ver os meus locais',
    },
    'spot-removed': {
      subject: 'Removemos um dos teus locais',
      body: 'Após uma denúncia, removemos um dos locais que propuseste. A remoção é definitiva. Este é o motivo:',
      button: 'Ver os meus locais',
    },
    suspended: {
      subject: 'A tua conta do Cruising está suspensa',
      body: 'Suspendemos a tua conta do Cruising. Continuas a poder explorar o mapa, mas não podes propor locais, escrever avaliações, fazer denúncias, fazer check-in nem enviar mensagens.',
      button: 'Ler as regras',
    },
    unread: {
      subject: 'Tens uma mensagem por ler',
      body: 'Alguém te escreveu no Cruising e ainda não a leste.',
      button: 'Ler a mensagem',
    },
    'verification-approved': {
      subject: 'O teu perfil está verificado',
      body: 'Revimos a tua foto de verificação: o teu perfil tem o selo «Verificado» e podes carregar fotos e vídeos.',
      button: 'Ir para o meu perfil',
    },
    'verification-rejected': {
      subject: 'Não conseguimos verificar o teu perfil',
      body: 'Revimos a tua foto de verificação e não a aprovámos. Eliminámos a foto. Podes enviar outra. Este é o motivo:',
      button: 'Ir para o meu perfil',
    },
    'verification-withdrawn': {
      subject: 'O teu perfil já não está verificado',
      body: 'A equipa retirou a verificação do teu perfil: já não tem o selo «Verificado» e já não podes carregar fotos nem vídeos.',
      button: 'Ler as regras',
    },
    'media-removed': {
      subject: 'Removemos uma das tuas fotos ou vídeos',
      body: 'Depois de a revermos, removemos uma foto ou um vídeo do teu perfil, que não pode ser carregado novamente. Este é o motivo:',
      button: 'Ir para o meu perfil',
    },
    favorites: {
      subject: 'Há atividade nos teus locais favoritos',
      body: 'Há atividade nos teus locais favoritos.',
      button: 'Ver os meus favoritos',
    },
    'meetup-cancelled': {
      subject: 'Um encontro foi cancelado',
      body: 'Um encontro do Cruising ao qual disseste que ias foi cancelado.',
      button: 'Ver os encontros',
    },
    reasonTitle: 'Motivo',
    until: 'Até',
    permanent: 'Até a equipa a levantar',
    settings: 'Podes desativar este e-mail no teu perfil do Cruising.',
  },
  invite: {
    subject: (name) => `${name} pediu-te para receberes os seus alertas de segurança da Codeqlick`,
    title: 'Alertas de segurança da Codeqlick',
    intro: (name) => [
      `${name} gostaria que fosses um dos seus contactos de confiança para os alertas de segurança da Codeqlick.`,
      `Quando ${name} sai para se encontrar com alguém, pode iniciar um temporizador de segurança. Se não o terminar a tempo, enviamos-te por e-mail a sua mensagem, a hora e, se escolher partilhá-lo, o local, para que possas confirmar que está bem.`,
      'Não vais receber mais nada da nossa parte e podes deixar de receber estes alertas a qualquer momento.',
    ],
    button: 'Aceitar ou recusar',
    outro: (stopUrl) => [`Deixa de receber estes alertas a qualquer momento: ${stopUrl}`],
    note: (name) =>
      `Se não conheces ${name} ou não queres isto, recusa ou ignora este e-mail: não te será enviado nada.`,
  },
  alert: {
    subject: (name) => `Alerta de segurança da Codeqlick: ${name} não deu sinal`,
    title: 'Alerta de segurança da Codeqlick',
    intro: (name) => [
      `${name} iniciou um temporizador de segurança e não o terminou a tempo. Pediu-nos que te avisássemos, para que possas confirmar que está bem.`,
      'Tenta contactá-lo. Se achares que está em perigo, liga para os serviços de emergência (112 na Europa).',
    ],
    message: 'A sua mensagem',
    time: 'Terminou às',
    place: 'Local',
    map: 'Mapa',
    button: 'Ver o local num mapa',
    outro: (stopUrl) => [`Deixar de receber estes alertas: ${stopUrl}`],
    note: 'Recebes isto porque aceitaste ser um contacto de confiança. Este é o único e-mail que este temporizador envia.',
  },
  member: {
    timer: {
      subject: 'O teu temporizador de segurança termina daqui a 10 minutos',
      body: 'Prolonga-o ou termina-o se estiveres bem. Se o tempo acabar, os teus contactos de confiança recebem um e-mail.',
      button: 'Abrir o meu temporizador',
    },
    health: {
      subject: 'Está na hora do teu check-up',
      body: 'Está na hora do teu check-up.',
      button: 'Encontrar um centro de testes',
    },
    settings: 'Podes alterar isto no teu perfil do Cruising.',
  },
  safetyPush: {
    timer: 'O teu temporizador de segurança termina daqui a 10 minutos',
    health: 'Está na hora do teu check-up',
  },
  push: {
    favorite: 'Está alguém num dos teus locais favoritos',
    message: 'Nova mensagem',
    meetup: 'Foi marcado um encontro num dos teus locais favoritos',
    safety: 'Alerta de segurança num dos teus locais favoritos',
    'meetup-cancelled': 'Um encontro a que te juntaste foi cancelado',
    album: 'Alguém partilhou contigo o seu álbum privado',
    wink: 'Alguém te enviou uma piscadela',
  },
};
