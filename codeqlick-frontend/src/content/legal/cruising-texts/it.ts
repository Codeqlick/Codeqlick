import type { CruisingLegalTexts } from '../cruising';

/** Cruising's terms of use and privacy policy in Italian. */
export const it: CruisingLegalTexts = {
  updated: '16 novembre 2026',
  owner: {
    owner: 'Titolare',
    taxId: 'Codice fiscale (NIF)',
    address: 'Indirizzo',
    email: 'E-mail',
    website: 'Sito web',
  },
  terms: {
    title: 'Condizioni d’uso di Cruising',
    description: 'Chi può usare Cruising, cosa si può pubblicare, come moderiamo e come andarsene.',
    markdown: (c) => `## Chi fornisce il servizio

Cruising (cruising.codeqlick.com) è un servizio di:

${c.ownerLines}

## Che cos’è

Una guida di luoghi d’incontro tra uomini, con una mappa e recensioni di persone maggiorenni. Non è una guida turistica né un servizio di incontri: raccoglie soltanto ciò che contribuiscono i membri, che esaminiamo prima di pubblicarlo.

## Solo per maggiorenni (18+)

Per proporre un luogo, recensirne uno o fare una segnalazione, dichiari di avere almeno 18 anni (e la maggiore età nel tuo paese, se è più alta). Puoi consultare la mappa e le pagine senza un account, ma questo servizio riguarda la sessualità adulta: se non sei maggiorenne, non usarlo. Chiudiamo qualsiasi account che riteniamo appartenga a un minore.

## Il tuo account

Ti serve un account con un’e-mail verificata e, per entrare in Cruising, indicare la tua data di nascita, accettare le regole e dare il tuo consenso. Sei responsabile di ciò che fai con il tuo account.

## Cosa contribuisci

- Luoghi che esistono e che conosci, con dati veritieri: nome, tipo, posizione, descrizione e orari migliori.
- **Mai** vicino a scuole, parchi giochi o luoghi frequentati da bambini. Nel dubbio, lo rifiutiamo.
- Recensioni oneste e rispettose, senza dati di contatto (numeri di telefono, e-mail, link o altre app), senza identificare persone e senza foto di persone senza il loro consenso.
- Il team esamina ogni luogo prima di pubblicarlo e può correggerlo. Le recensioni vengono pubblicate subito e le moderiamo in seguito.
- Ciò che scrivi resta tuo. Ci concedi un permesso gratuito e non esclusivo di conservarlo e mostrarlo in Cruising finché non lo elimini.

## Foto e video

- I membri che sono entrati e sono **verificati** possono caricare sul proprio profilo foto e video **di se stessi**. Sono ammessi contenuti sessuali di se stessi tra adulti, e possono vederli solo i membri che sono entrati.
- **Nessun minore di 18 anni** può comparire, e nulla può essere illegale. Non può comparire nessuno che non abbia dato il consenso, e le immagini devono essere tue. A ogni caricamento spunti una casella di consenso.
- Foto e video vengono **pubblicati prima che il team li esamini**; il team li esamina in seguito e rimuove ciò che viola queste condizioni, bloccando l’immagine in modo che non possa essere caricata di nuovo. Possiamo sospendere l’account.
- La **verifica** è una tua foto con il tuo nickname, esaminata dal team ed eliminata subito dopo. Il badge «Verificato» significa soltanto che il team ha controllato quella foto: non che sia stato controllato un documento d’identità.
- Ciò che carichi resta tuo e ci concedi un permesso gratuito e non esclusivo di conservarlo e mostrarlo in Cruising finché non lo elimini.

## Come ti comporti

Rispetta gli altri, il luogo e la legge del posto in cui ti trovi. Niente vendita di sesso o di droghe, molestie, minacce, ricatti o discriminazioni. Se qualcosa è pericoloso o illegale, segnalalo. Le regole complete sono in [Regole](/${c.locale}/cruising/rules).

## Moderazione, segnalazioni e rimozione

Puoi segnalare qualsiasi luogo, recensione, profilo, foto o video. Una segnalazione per un minore, la mancanza di consenso, immagini rubate o contenuti illegali lo nasconde subito finché non lo esaminiamo. Chiunque, anche senza account, può chiederci di rimuovere un luogo su [cruising.codeqlick.com/${c.locale}/takedown](/${c.locale}/cruising/takedown); quando riguarda un minore o qualcosa di illegale e viene indicato il link, lo nascondiamo subito, e rispondiamo sempre entro 24 ore. Un luogo rimosso dalla moderazione non può essere inviato di nuovo. Se rimuoviamo qualcosa di tuo o sospendiamo il tuo account, ti inviamo per e-mail il motivo e puoi rispondere per chiederci di riesaminarlo (regolamento sui servizi digitali, DSA).

## Cosa non garantiamo

Cruising è gratuito e offerto così com’è. Le informazioni provengono dai membri: possono essere errate, non aggiornate o modificate, e un luogo può essere pericoloso o sorvegliato. Andare in un posto è una tua decisione e una tua responsabilità. Non rispondiamo di ciò che sfugge al nostro controllo, salvo nei casi in cui la legge non consente di escluderlo.

## Modifiche e cancellazione

Possiamo modificare queste condizioni; in caso di una modifica importante ti chiederemo di accettarle di nuovo quando entri. Puoi andartene quando vuoi eliminando il tuo account in «Il mio account»: il tuo profilo, le tue recensioni e le tue segnalazioni vengono eliminati, e i luoghi che hai proposto restano pubblicati senza il tuo nome.

## Legge applicabile

Queste condizioni sono regolate dalla legge spagnola. Per qualsiasi domanda o reclamo, scrivici a ${c.mail}.`,
  },
  privacy: {
    title: 'Informativa sulla privacy di Cruising',
    description:
      'Quali dati tratta Cruising, su quale base giuridica, per quanto tempo e come esercitare i tuoi diritti.',
    markdown: (c) => `## Titolare del trattamento

${c.ownerLines}

## Dati particolarmente protetti

L’uso di Cruising può rivelare aspetti della tua **vita sessuale o del tuo orientamento sessuale**, categorie particolari di dati (articolo 9 del GDPR/RGPD). Li trattiamo solo con il tuo **consenso esplicito** (articolo 9.2.a), che dai spuntando una casella separata quando entri in Cruising. Puoi revocarlo quando vuoi eliminando il tuo account. Consultare la mappa e le pagine senza un account non richiede alcun tuo dato.

## Quali dati trattiamo e perché

- **Account:** nome, e-mail, password (cifrata) e lingua, per darti accesso (articolo 6.1.b).
- **Età:** indichi la tua data di nascita quando entri, ma **conserviamo solo l’anno**.
- **Ingresso:** la versione delle regole che hai accettato e quando, e se hai attivato gli avvisi via e-mail.
- **Luoghi:** quelli che proponi (nome, tipo, posizione, descrizione, orari) con il tuo account, affinché tu possa vederli e modificarli e noi possiamo moderarli.
- **Recensioni e segnalazioni:** quelle che scrivi e che fai.
- **Foto e video (categorie particolari di dati):** quelli che carichi sul tuo profilo, con il tuo **consenso esplicito** a ogni caricamento (articolo 9.2.a). Ne rimuoviamo i metadati (posizione, fotocamera). Sono conservati su server nell’Unione europea (OVHcloud), **esclusi dai backup**, e possono vederli solo i membri che sono entrati, mai i motori di ricerca.
- **Foto di verifica:** quella che ci invii con il tuo nickname; la vede solo il team e viene **eliminata non appena esaminata**: conserviamo solo la decisione.
- **Salute sessuale (dati relativi alla salute, categoria particolare):** solo se la attivi, con un **consenso esplicito proprio** (articolo 9.2.a), separato da quello dell’ingresso: se assumi la PrEP, il mese del tuo ultimo test e ogni quanto ricordarti il controllo. Per impostazione predefinita li vedi solo tu; se scegli di mostrarli, li vedono sul tuo profilo i membri che sono entrati. Disattivarla li **elimina** subito. I promemoria dicono soltanto «È ora del tuo controllo».
- **Contatti di fiducia e timer di sicurezza:** l’e-mail di un massimo di 2 persone che scegli, il nome con cui ti presenti a loro, e se hanno accettato (legittimo interesse alla tua sicurezza, articolo 6.1.f; ogni contatto dà il proprio consenso accettando via e-mail e può smettere in qualsiasi momento). Di un timer conserviamo l’ora di fine, il tuo messaggio e, solo se scegli di condividerlo, il luogo. Se non lo termini in tempo, i tuoi contatti che hanno accettato ricevono un’unica e-mail con quel nome, il tuo messaggio, l’ora e il luogo condiviso; mai il tuo nickname né che cos’è Cruising.
- **Sicurezza:** l’indirizzo IP e il browser di ogni sessione (legittimo interesse, articolo 6.1.f).
- **La tua posizione:** se premi «Localizzami», il tuo browser centra la mappa sulla tua posizione. **Quella posizione non lascia mai il tuo dispositivo: non viene né inviata né conservata.**

## E-mail

Ti scriviamo quando il team pubblica o rifiuta un tuo luogo, o sospende il tuo account. Le e-mail non includono mai il nome o il contenuto del luogo. Puoi disattivare l’avviso «luogo pubblicato» nel tuo profilo; le decisioni del team vengono sempre inviate.

## La mappa

Le immagini della mappa vengono caricate dal tuo browser direttamente dai server della **OpenStreetMap Foundation**, che ricevono il tuo indirizzo IP e la zona che stai guardando. Sono regolate dalla loro [informativa sulla privacy](https://wiki.osmfoundation.org/wiki/Privacy_Policy). La mappa è © contributori di OpenStreetMap.

## Chi vede i tuoi dati

I luoghi pubblicati li vede chiunque, senza il tuo nome. Le recensioni le vedono solo i membri che sono entrati, come «Membro». Il tuo nome e la tua e-mail non vengono mai mostrati. Non vendiamo né cediamo dati a nessuno, salvo quando la legge lo impone (per esempio un ordine di un tribunale, o per denunciare contenuti che coinvolgono minori). L’unico responsabile del trattamento è **OVHcloud**, che ospita il servizio, il database e la posta elettronica su server nell’Unione europea.

## Per quanto tempo li conserviamo

Finché hai l’account. Le tue foto e i tuoi video, finché non li elimini tu o l’account; i file spariscono dal server entro 6 ore. La foto di verifica viene eliminata una volta esaminata. I timer, 7 giorni dopo la loro fine. Quando elimini l’account, vengono eliminati il tuo profilo, le recensioni, le segnalazioni, i dati sulla salute, i contatti di fiducia e i timer; i luoghi che hai proposto restano pubblicati senza il tuo nome. I backup vengono cancellati dopo 14 giorni.

## I tuoi diritti

Puoi scaricare i tuoi dati ed eliminare il tuo account da «Il mio account». Puoi anche chiederci di accedere ai tuoi dati, rettificarli o cancellarli, di limitarne il trattamento o di opporti a esso, oppure di riceverli in un formato portabile scrivendo a ${c.mail}. Se ritieni che non li abbiamo trattati correttamente, puoi presentare un reclamo all’Agenzia spagnola per la protezione dei dati (AEPD, [aepd.es](https://www.aepd.es)).

## Cookie

Solo cookie tecnici: \`NEXT_LOCALE\` (lingua) e \`cq_at\` / \`cq_rt\` (sessione avviata). Nessuna pubblicità.`,
  },
};
