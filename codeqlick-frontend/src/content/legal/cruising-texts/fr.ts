import type { CruisingLegalTexts } from '../cruising';

/** Cruising's terms of use and privacy policy in French. */
export const fr: CruisingLegalTexts = {
  updated: '17 novembre 2026',
  owner: {
    owner: 'Titulaire',
    taxId: 'Numéro fiscal (NIF)',
    address: 'Adresse',
    email: 'E-mail',
    website: 'Site web',
  },
  terms: {
    title: 'Conditions d’utilisation de Cruising',
    description:
      'Qui peut utiliser Cruising, ce qu’on peut y contribuer, comment nous modérons et comment partir.',
    markdown: (c) => `## Qui fournit le service

Cruising (cruising.neoqlick.com) est un service de :

${c.ownerLines}

## De quoi il s’agit

Un annuaire de lieux de rencontre entre hommes, avec une carte et des avis rédigés par des adultes. Ce n’est ni un guide touristique ni un service de rencontres : il rassemble uniquement ce que les membres apportent, que nous vérifions avant de le publier.

## Réservé aux adultes (18 ans et plus)

Pour proposer un lieu, donner un avis ou faire un signalement, tu déclares avoir au moins 18 ans (et l’âge de la majorité dans ton pays, s’il est plus élevé). Tu peux consulter la carte et les fiches sans compte, mais ce service traite de sexualité entre adultes : si tu n’es pas majeur, ne l’utilise pas. Nous fermons tout compte dont nous pensons qu’il appartient à un mineur.

## Ton compte

Tu as besoin d’un compte avec une adresse e-mail vérifiée et, pour entrer dans Cruising, de ta date de naissance, des règles et de ton consentement. Tu es responsable de ce que tu en fais.

## Ce que tu apportes

- Des lieux qui existent et que tu connais, avec des informations exactes : nom, type, emplacement, description et meilleurs horaires.
- **Jamais** près d’écoles, d’aires de jeux ou de lieux fréquentés par des enfants. En cas de doute, nous le refusons.
- Des avis honnêtes et respectueux, sans coordonnées (numéros de téléphone, e-mails, liens ou autres applis), sans identifier personne et sans photos de personnes sans leur consentement.
- L’équipe vérifie chaque lieu avant sa publication et peut le corriger. Les avis sont publiés immédiatement et nous les modérons ensuite.
- Tu restes propriétaire de ce que tu écris. Tu nous accordes une autorisation gratuite et non exclusive de le conserver et de l’afficher dans Cruising jusqu’à ce que tu le supprimes.

## Photos et vidéos

- Les membres qui sont entrés et sont **vérifiés** peuvent publier sur leur profil des photos et des vidéos **d’eux-mêmes**. Le contenu sexuel de soi-même entre adultes est autorisé, et seuls les membres qui sont entrés peuvent le voir.
- **Aucune personne de moins de 18 ans** ne peut y apparaître, et rien ne peut être illégal. Personne n’ayant pas donné son consentement ne peut y apparaître, et les images doivent être les tiennes. Tu coches une case de consentement à chaque envoi.
- Les photos et vidéos sont **publiées avant que l’équipe ne les vérifie** ; l’équipe les vérifie ensuite et retire ce qui enfreint ces conditions, en bloquant l’image pour qu’elle ne puisse pas être renvoyée. Nous pouvons suspendre le compte.
- La **vérification** consiste en une photo de toi avec ton nom d’utilisateur, « Neoqlick » et la date, examinée par l’équipe et conservée en privé tant que la vérification est valable (voir « Sécurité entre les applications 18+ de Neoqlick »). Le badge « Vérifié » signifie seulement que l’équipe a contrôlé cette photo : pas qu’une pièce d’identité a été vérifiée.
- Tu restes propriétaire de ce que tu publies et tu nous accordes une autorisation gratuite et non exclusive de le conserver et de l’afficher dans Cruising jusqu’à ce que tu le supprimes.

## Ton comportement

Respecte les autres, le lieu et la loi de l’endroit où tu te trouves. Pas de vente de sexe ou de drogues, de harcèlement, de menaces, de chantage ni de discrimination. Si quelque chose est dangereux ou illégal, signale-le. Les règles complètes se trouvent dans [Règles](/${c.locale}/cruising/rules).

## Modération, signalements et retrait

Tu peux signaler n’importe quel lieu, avis, profil, photo ou vidéo. Un signalement pour un mineur, un consentement manquant, des images volées ou un contenu illégal le masque immédiatement jusqu’à ce que nous l’examinions. N’importe qui, même sans compte, peut nous demander de retirer un lieu sur [cruising.neoqlick.com/${c.locale}/takedown](/${c.locale}/cruising/takedown) ; lorsqu’il s’agit d’un mineur ou de quelque chose d’illégal et que le lien est fourni, nous le masquons immédiatement, et nous répondons toujours dans les 24 heures. Un lieu retiré par la modération ne peut pas être proposé à nouveau. Si nous retirons quelque chose qui t’appartient ou suspendons ton compte, nous t’envoyons le motif par e-mail et tu peux y répondre pour nous demander de réexaminer la décision (règlement sur les services numériques).

## Ce que nous ne garantissons pas

Cruising est gratuit et proposé en l’état. Les informations viennent des membres : elles peuvent être fausses, obsolètes ou avoir changé, et un lieu peut être dangereux ou surveillé. Te rendre quelque part est ta décision et ta responsabilité. Nous ne sommes pas responsables de ce qui échappe à notre contrôle, sauf lorsque la loi ne permet pas d’exclure cette responsabilité.

## Modifications et départ

Nous pouvons modifier ces conditions ; en cas de changement important, nous te demanderons de les accepter à nouveau lorsque tu entreras. Tu peux partir quand tu veux en supprimant ton compte dans « Mon compte » : ton profil, tes avis et tes signalements sont supprimés, et les lieux que tu as proposés restent publiés sans ton nom.

## Droit applicable

Ces conditions sont régies par le droit espagnol. Pour toute question ou réclamation, écris-nous à ${c.mail}.`,
  },
  privacy: {
    title: 'Politique de confidentialité de Cruising',
    description:
      'Quelles données Cruising traite, sur quelle base juridique, pendant combien de temps et comment exercer tes droits.',
    markdown: (c) => `## Responsable du traitement

${c.ownerLines}

## Données particulièrement protégées

Utiliser Cruising peut révéler des aspects de ta **vie sexuelle ou de ton orientation sexuelle**, des catégories particulières de données (article 9 du RGPD). Nous ne les traitons qu’avec ton **consentement explicite** (article 9.2.a), que tu donnes en cochant une case distincte lorsque tu entres dans Cruising. Tu peux le retirer quand tu veux en supprimant ton compte. Consulter la carte et les fiches sans compte ne nécessite aucune donnée de ta part.

## Quelles données nous traitons et pourquoi

- **Compte :** nom, adresse e-mail, mot de passe (chiffré) et langue, pour te donner accès (article 6.1.b).
- **Âge :** tu indiques ta date de naissance en entrant, mais **nous ne conservons que l’année**.
- **Entrée :** la version des règles que tu as acceptée et sa date, et si tu as activé les alertes par e-mail.
- **Lieux :** ceux que tu proposes (nom, type, emplacement, description, horaires) avec ton compte, pour que tu puisses les voir et les modifier et pour que nous puissions les modérer.
- **Avis et signalements :** ceux que tu rédiges et que tu fais.
- **Photos et vidéos (catégorie particulière de données) :** celles que tu publies sur ton profil, avec ton **consentement explicite** à chaque envoi (article 9.2.a). Nous supprimons leurs métadonnées (localisation, appareil photo). Elles sont stockées sur des serveurs situés dans l’Union européenne (OVHcloud), **hors des sauvegardes**, et seuls les membres qui sont entrés peuvent les voir, jamais les moteurs de recherche.
- **Photo de vérification :** celle que tu nous envoies avec ton nom d’utilisateur, « Neoqlick » et la date ; seule l’équipe la voit. Si elle est approuvée, elle est **conservée en privé tant que la vérification est valable** et supprimée quand elle est retirée ou perdue, remplacée ou quand tu supprimes ton compte ; une photo refusée est supprimée immédiatement. La vérification est partagée avec les autres applications 18+ de Neoqlick (voir la dernière section).
- **Santé sexuelle (données de santé, catégorie particulière) :** uniquement si tu l’actives, avec son **propre consentement explicite** (article 9.2.a), distinct de celui de l’entrée : si tu prends la PrEP, le mois de ton dernier test et à quelle fréquence te rappeler ton dépistage. Par défaut, toi seul les vois ; si tu choisis de les afficher, les membres qui sont entrés les voient sur ton profil. Désactiver cette option les **supprime** immédiatement. Les rappels disent seulement « C’est l’heure de ton dépistage ».
- **Contacts de confiance et minuteur de sécurité :** l’adresse e-mail de 2 personnes au maximum que tu choisis, le nom que tu te donnes pour elles, et si elles ont accepté (intérêt légitime pour ta sécurité, article 6.1.f ; chaque contact donne son propre consentement en acceptant par e-mail et peut arrêter à tout moment). D’un minuteur, nous conservons son heure de fin, ton message et, seulement si tu choisis de le partager, le lieu. Si tu ne l’arrêtes pas à temps, tes contacts qui ont accepté reçoivent un seul e-mail avec ce nom, ton message, l’heure et le lieu partagé ; jamais ton nom d’utilisateur ni ce qu’est Cruising.
- **Sécurité :** l’adresse IP et le navigateur de chaque session (intérêt légitime, article 6.1.f).
- **Ta position :** si tu appuies sur « Me localiser », ton navigateur centre la carte sur ta position. **Cette position ne quitte jamais ton appareil : elle n’est ni envoyée ni conservée.**

## E-mails

Nous t’écrivons lorsque l’équipe publie ou refuse l’un de tes lieux, ou suspend ton compte. Les e-mails n’incluent jamais le nom ni le contenu du lieu. Tu peux désactiver l’alerte « lieu publié » dans ton profil ; les décisions de l’équipe sont toujours envoyées.

## La carte

Les images de la carte sont chargées par ton navigateur directement depuis les serveurs de l’**OpenStreetMap Foundation**, qui reçoivent ton adresse IP et la zone que tu consultes. Elles sont régies par leur [politique de confidentialité](https://wiki.osmfoundation.org/wiki/Privacy_Policy). La carte est © les contributeurs d’OpenStreetMap.

## Qui voit tes données

Les lieux publiés sont visibles par tous, sans ton nom. Les avis ne sont visibles que par les membres qui sont entrés, sous le nom « Membre ». Ton nom et ton adresse e-mail ne sont jamais affichés. Nous ne vendons ni ne cédons de données à qui que ce soit, sauf si la loi l’exige (par exemple une décision de justice, ou pour signaler un contenu impliquant des mineurs). Le seul sous-traitant est **OVHcloud**, qui héberge le service, la base de données et l’e-mail sur des serveurs situés dans l’Union européenne.

## Combien de temps nous les conservons

Tant que tu as ton compte. Tes photos et vidéos, jusqu’à ce que tu les supprimes ou supprimes le compte ; les fichiers disparaissent du serveur dans les 6 heures. La photo de vérification, si elle est approuvée, est conservée tant que la vérification est valable ; une photo refusée est supprimée immédiatement. Les minuteurs, 7 jours après leur fin. Lorsque tu supprimes le compte, ton profil, tes avis, tes signalements, tes données de santé, tes contacts de confiance et tes minuteurs sont supprimés ; les lieux que tu as proposés restent publiés sans ton nom. Les sauvegardes sont effacées au bout de 14 jours.

## Tes droits

Tu peux télécharger tes données et supprimer ton compte depuis « Mon compte ». Tu peux aussi nous demander d’accéder à tes données, de les rectifier ou de les effacer, d’en limiter le traitement ou de t’y opposer, ou de les recevoir dans un format portable en écrivant à ${c.mail}. Si tu estimes que nous ne les avons pas traitées correctement, tu peux introduire une réclamation auprès de l’Agence espagnole de protection des données ([aepd.es](https://www.aepd.es)).

## Cookies

Uniquement des cookies techniques : \`NEXT_LOCALE\` (langue) et \`cq_at\` / \`cq_rt\` (connexion). Aucune publicité.`,
  },
};
