import type { CruisingLegalTexts } from '../cruising';

/** Cruising's terms of use and privacy policy in Portuguese. */
export const pt: CruisingLegalTexts = {
  updated: '17 de novembro de 2026',
  owner: {
    owner: 'Titular',
    taxId: 'Número fiscal (NIF)',
    address: 'Morada',
    email: 'E-mail',
    website: 'Site',
  },
  terms: {
    title: 'Termos de utilização do Cruising',
    description: 'Quem pode usar o Cruising, o que se pode contribuir, como moderamos e como sair.',
    markdown: (c) => `## Quem presta o serviço

O Cruising (cruising.codeqlick.com) é um serviço de:

${c.ownerLines}

## O que é

Um diretório de locais de encontro entre homens, com mapa e avaliações de adultos. Não é um guia turístico nem um serviço de encontros: apenas reúne o que os membros contribuem, que revemos antes de publicar.

## Só para adultos (18+)

Para propor um local, avaliar um local ou fazer uma denúncia, declaras que tens pelo menos 18 anos (e a maioridade no teu país, se for superior). Podes ver o mapa e as páginas sem conta, mas este serviço trata de sexualidade adulta: se não és adulto, não o uses. Encerramos qualquer conta que acreditemos pertencer a um menor.

## A tua conta

Precisas de uma conta com um e-mail verificado e de entrar no Cruising com a tua data de nascimento, as regras e o teu consentimento. És responsável pelo que fazes com ela.

## O que contribuis

- Locais que existem e que conheces, com dados verdadeiros: nome, tipo, localização, descrição e melhores horários.
- **Nunca** perto de escolas, parques infantis ou locais frequentados por crianças. Em caso de dúvida, rejeitamos.
- Avaliações honestas e respeitosas, sem dados de contacto (números de telefone, e-mails, ligações ou outras apps), sem identificar pessoas e sem fotos de pessoas sem o seu consentimento.
- A equipa revê cada local antes de ser publicado e pode corrigi-lo. As avaliações são publicadas de imediato e moderamo-las depois.
- O que escreves continua a ser teu. Concedes-nos uma autorização gratuita e não exclusiva para o guardar e mostrar no Cruising até o eliminares.

## Fotos e vídeos

- Os membros que entraram no Cruising e estão **verificados** podem carregar fotos e vídeos **de si próprios** no seu perfil. É permitido conteúdo sexual de si próprio entre adultos, e só os membros que entraram no Cruising o podem ver.
- **Ninguém com menos de 18 anos** pode aparecer, e nada pode ser ilegal. Não pode aparecer ninguém que não tenha dado o seu consentimento, e as imagens têm de ser tuas. Marcas uma caixa de consentimento em cada carregamento.
- As fotos e os vídeos são **publicados antes de a equipa os rever**; a equipa revê-os depois e remove o que viola estes termos, bloqueando a imagem para que não possa ser carregada novamente. Podemos suspender a conta.
- A **verificação** é uma foto tua com o teu nome de utilizador, «Codeqlick» e a data, revista pela equipa e guardada em privado enquanto a verificação se mantiver (ver «Segurança entre as apps 18+ da Codeqlick»). O selo «Verificado» significa apenas que a equipa verificou essa foto: não que tenha sido verificado um documento de identidade.
- O que carregas continua a ser teu e concedes-nos uma autorização gratuita e não exclusiva para o guardar e mostrar no Cruising até o eliminares.

## Como te comportas

Respeita os outros, o local e a lei do sítio onde estás. Nada de venda de sexo ou de drogas, assédio, ameaças, chantagem ou discriminação. Se algo for perigoso ou ilegal, denuncia-o. As regras completas estão em [Regras](/${c.locale}/cruising/rules).

## Moderação, denúncias e remoção

Podes denunciar qualquer local, avaliação, perfil, foto ou vídeo. Uma denúncia por menor, falta de consentimento, imagens roubadas ou conteúdo ilegal oculta-o de imediato até o revermos. Qualquer pessoa, mesmo sem conta, pode pedir-nos que removamos um local em [cruising.codeqlick.com/${c.locale}/takedown](/${c.locale}/cruising/takedown); quando se trata de um menor ou de algo ilegal e indica a ligação, ocultamo-lo de imediato, e respondemos sempre no prazo de 24 horas. Um local removido pela moderação não pode ser enviado novamente. Se removermos algo teu ou suspendermos a tua conta, enviamos-te o motivo por e-mail e podes responder a pedir-nos que o revejamos (Regulamento dos Serviços Digitais).

## O que não garantimos

O Cruising é gratuito e oferecido tal como está. A informação vem dos membros: pode estar errada, desatualizada ou ter mudado, e um local pode ser perigoso ou vigiado. Ir a algum sítio é decisão e responsabilidade tua. Não somos responsáveis pelo que está fora do nosso controlo, exceto quando a lei não permita excluir essa responsabilidade.

## Alterações e saída

Podemos alterar estes termos; em caso de alteração importante, pedir-te-emos que os aceites novamente quando entrares. Podes sair quando quiseres eliminando a tua conta em «A minha conta»: o teu perfil, as tuas avaliações e as tuas denúncias são eliminados, e os locais que propuseste continuam publicados sem o teu nome.

## Lei aplicável

Estes termos regem-se pela lei espanhola. Para qualquer dúvida ou reclamação, escreve-nos para ${c.mail}.`,
  },
  privacy: {
    title: 'Política de privacidade do Cruising',
    description:
      'Que dados o Cruising trata, com que fundamento jurídico, durante quanto tempo e como exercer os teus direitos.',
    markdown: (c) => `## Responsável pelo tratamento

${c.ownerLines}

## Dados especialmente protegidos

Usar o Cruising pode revelar aspetos da tua **vida sexual ou orientação sexual**, dados de categoria especial (artigo 9.º do RGPD). Só os tratamos com o teu **consentimento explícito** (artigo 9.º, n.º 2, alínea a)), que dás marcando uma caixa separada quando entras no Cruising. Podes retirá-lo quando quiseres eliminando a tua conta. Ver o mapa e as páginas sem conta não exige nenhum dado teu.

## Que dados tratamos e porquê

- **Conta:** nome, e-mail, palavra-passe (encriptada) e idioma, para te dar acesso (artigo 6.º, n.º 1, alínea b)).
- **Idade:** indicas a tua data de nascimento quando entras, mas **só guardamos o ano**.
- **Entrada:** a versão das regras que aceitaste e quando, e se ativaste os alertas por e-mail.
- **Locais:** os que propões (nome, tipo, localização, descrição, horários) associados à tua conta, para que os possas ver e editar e para que os possamos moderar.
- **Avaliações e denúncias:** as que escreves e fazes.
- **Fotos e vídeos (dados de categoria especial):** os que carregas no teu perfil, com o teu **consentimento explícito** em cada carregamento (artigo 9.º, n.º 2, alínea a)). Removemos os seus metadados (localização, câmara). São guardados em servidores na União Europeia (OVHcloud), **fora das cópias de segurança**, e só os membros que entraram no Cruising os podem ver, nunca os motores de pesquisa.
- **Foto de verificação:** a que nos envias com o teu nome de utilizador, «Codeqlick» e a data; só a equipa a vê. Se aprovada, é **guardada em privado enquanto a verificação se mantiver** e eliminada quando é retirada ou perdida, substituída ou quando eliminas a tua conta; uma rejeitada é eliminada de imediato. A verificação é partilhada com as outras apps 18+ da Codeqlick (ver a última secção).
- **Saúde sexual (dados de saúde, categoria especial):** só se a ativares, com o seu **próprio consentimento explícito** (artigo 9.º, n.º 2, alínea a)), separado do da entrada: se tomas PrEP, o mês do teu último teste e com que frequência te lembramos do teu rastreio. Por defeito só tu os vês; se escolheres mostrá-los, os membros que entraram no Cruising veem-nos no teu perfil. Desativá-la **elimina-os** de imediato. Os lembretes dizem apenas «Está na hora do teu check-up».
- **Contactos de confiança e temporizador de segurança:** o e-mail de até 2 pessoas que escolhes, o nome com que te identificas perante elas e se aceitaram (interesse legítimo na tua segurança, artigo 6.º, n.º 1, alínea f); cada contacto dá o seu próprio consentimento ao aceitar por e-mail e pode deixar de o ser a qualquer momento). De um temporizador guardamos a hora de fim, a tua mensagem e, só se escolheres partilhá-lo, o local. Se não o terminares a tempo, os teus contactos que aceitaram recebem um único e-mail com esse nome, a tua mensagem, a hora e o local partilhado; nunca o teu nome de utilizador nem o que é o Cruising.
- **Segurança:** o endereço IP e o navegador de cada sessão (interesse legítimo, artigo 6.º, n.º 1, alínea f)).
- **A tua posição:** se carregares em «Localizar-me», o teu navegador centra o mapa na tua posição. **Essa posição nunca sai do teu dispositivo: não é enviada nem guardada.**

## E-mails

Escrevemos-te quando a equipa publica ou rejeita um local teu, ou suspende a tua conta. Os e-mails nunca incluem o nome nem o conteúdo do local. Podes desativar o alerta de «local publicado» no teu perfil; as decisões da equipa são sempre enviadas.

## O mapa

As imagens do mapa são carregadas pelo teu navegador diretamente dos servidores da **OpenStreetMap Foundation**, que recebem o teu endereço IP e a zona que estás a ver. Regem-se pela sua [política de privacidade](https://wiki.osmfoundation.org/wiki/Privacy_Policy). O mapa é © colaboradores do OpenStreetMap.

## Quem vê os teus dados

Os locais publicados são vistos por qualquer pessoa, sem o teu nome. As avaliações só são vistas pelos membros que entraram no Cruising, como «Membro». O teu nome e o teu e-mail nunca são mostrados. Não vendemos nem cedemos dados a ninguém, salvo se a lei o exigir (por exemplo, uma ordem judicial, ou para comunicar conteúdo que envolva menores). O único subcontratante é a **OVHcloud**, que aloja o serviço, a base de dados e o e-mail em servidores na União Europeia.

## Durante quanto tempo os guardamos

Enquanto tiveres a conta. As tuas fotos e vídeos, até os eliminares a eles ou à conta; os ficheiros desaparecem do servidor no prazo de 6 horas. A foto de verificação, se aprovada, é guardada enquanto a verificação se mantiver; uma rejeitada é eliminada de imediato. Os temporizadores, 7 dias depois de terminarem. Quando eliminas a conta, o teu perfil, as tuas avaliações, as tuas denúncias, os dados de saúde, os contactos de confiança e os temporizadores são eliminados; os locais que propuseste continuam publicados sem o teu nome. As cópias de segurança são eliminadas ao fim de 14 dias.

## Os teus direitos

Podes descarregar os teus dados e eliminar a tua conta em «A minha conta». Também nos podes pedir o acesso, a retificação ou o apagamento dos teus dados, a limitação do seu tratamento ou opor-te a ele, ou recebê-los num formato portátil, escrevendo para ${c.mail}. Se achares que não os tratámos devidamente, podes apresentar uma reclamação à Agência Espanhola de Proteção de Dados ([aepd.es](https://www.aepd.es)).

## Cookies

Apenas cookies técnicos: \`NEXT_LOCALE\` (idioma) e \`cq_at\` / \`cq_rt\` (sessão iniciada). Sem publicidade.`,
  },
};
