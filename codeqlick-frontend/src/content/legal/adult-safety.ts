import type { AppLocale } from '@/i18n/routing';

/**
 * "Safety across Codeqlick's 18+ apps" (architecture 4.16, decision 119): the section every 18+
 * app's terms of use and privacy policy carry (Cruising in six languages; Swipe and Videochat in
 * English and Spanish). One source, so the three say the same thing. A lawyer should review it
 * (the architecture notes tying cross-app safety to the art. 9 consent at entry).
 */
export type AdultSafetyKind = 'terms' | 'privacy';

type Texts = Record<AdultSafetyKind, (mail: string) => string>;

const en: Texts = {
  terms: () => `## Safety across Codeqlick's 18+ apps

Codeqlick runs three 18+ apps on the same account: Cruising, Swipe and Videochat. To keep their members safe, some safety measures apply in all three. Only these are shared: your profile, photos, messages and activity stay in each app.

- **Blocks.** If you block someone in one app, you and that person are blocked in all three, both ways. Unblocking them lifts it in all three.
- **Serious suspensions.** A suspension for minors, non-consensual content or illegal content applies in all three apps, with the same end date, and also stops you from entering an app you hadn't used.
- **Verification.** You verify once: one photo of you holding a paper with your name in the app, "Codeqlick" and the date. If the team approves it, the "Verified" badge shows in all three apps. The photo is kept privately while the verification stands and only the team sees it; it is deleted when the verification is withdrawn or lost, when you replace it or when you delete your account. The badge is withdrawn too when a serious suspension starts.
- **No coming back with a new account.** If you delete your account while a serious suspension applies, we keep a keyed hash of your email (not the email itself) for the length of the suspension, or 2 years if it was permanent, so that account can't enter the 18+ apps again. If you think it is a mistake, write to us.
- **The team's view.** When moderating, the team sees a person's reports and suspensions in the three apps.`,
  privacy: (mail) => `## Safety across Codeqlick's 18+ apps

Codeqlick runs three 18+ apps (Cruising, Swipe and Videochat) on the same account, and shares only safety measures between them:

- **Blocks:** who blocked whom, and in which app the block was made, so it applies in the three.
- **Verification:** its status and dates, the name written on the paper and the photo, which is **kept privately while the verification stands** (only the team sees it) and deleted when the verification is withdrawn or lost, when you replace it or when you delete your account. A rejected photo is deleted at once. In Cruising and Videochat this changes what we said before: an approved photo used to be deleted once reviewed.
- **Serious suspensions** (minors, non-consensual content, illegal content): who, why, the category, the app where it started and its dates. If you delete your account while one applies, we keep **only a keyed hash (HMAC) of your email**, the category and the end date, with no name, account or reports, for the length of the suspension or **2 years** if permanent. It is used only to refuse entering the 18+ apps with that email, and it is deleted when it expires or if we accept an appeal sent to ${mail}.
- **The team's view:** moderators see a person's reports and suspensions in the three apps.

**Legal basis.** Legitimate interest in protecting members and preventing abuse (article 6.1.f GDPR). The balance holds because a member reasonably expects that someone removed for sexual content involving minors does not stay in a sister app on the same account; only safety measures are shared and only moderators see the history. Because using these apps can reveal your sex life or sexual orientation (article 9), this processing also rests on the **explicit consent** you give when you enter each app (article 9.2.a), which includes that safety measures (blocks, serious suspensions, verification) apply across Codeqlick's 18+ apps. You can object, or withdraw your consent, by deleting your account or writing to ${mail}.`,
};

const es: Texts = {
  terms: () => `## Seguridad entre las apps +18 de Codeqlick

Codeqlick tiene tres apps +18 con la misma cuenta: Cruising, Swipe y Videochat. Para proteger a sus miembros, algunas medidas de seguridad valen en las tres. Solo se comparten estas: tu perfil, tus fotos, tus mensajes y tu actividad se quedan en cada app.

- **Bloqueos.** Si bloqueas a alguien en una app, tú y esa persona quedáis bloqueados en las tres, en los dos sentidos. Al desbloquearla se levanta en las tres.
- **Suspensiones graves.** Una suspensión por menores, contenido sin consentimiento o contenido ilegal vale en las tres apps, con la misma fecha de fin, y además te impide entrar en una app que no habías usado.
- **Verificación.** Te verificas una sola vez: una foto tuya con un papel con tu nombre en la app, «Codeqlick» y la fecha. Si el equipo la aprueba, la insignia «Verificado» aparece en las tres apps. La foto se guarda en privado mientras la verificación siga vigente y solo la ve el equipo; se borra cuando se retira o se pierde la verificación, cuando la sustituyes o cuando borras tu cuenta. La insignia también se retira cuando empieza una suspensión grave.
- **Sin volver con una cuenta nueva.** Si borras tu cuenta mientras tienes una suspensión grave, guardamos un hash con clave de tu correo (no el correo) durante lo que dure la suspensión, o 2 años si era permanente, para que esa cuenta no pueda volver a entrar en las apps +18. Si crees que es un error, escríbenos.
- **La vista del equipo.** Al moderar, el equipo ve las denuncias y las suspensiones de una persona en las tres apps.`,
  privacy: (mail) => `## Seguridad entre las apps +18 de Codeqlick

Codeqlick tiene tres apps +18 (Cruising, Swipe y Videochat) con la misma cuenta, y entre ellas solo comparte medidas de seguridad:

- **Bloqueos:** quién bloqueó a quién y en qué app se hizo el bloqueo, para que valga en las tres.
- **Verificación:** su estado y sus fechas, el nombre escrito en el papel y la foto, que se **guarda en privado mientras la verificación siga vigente** (solo la ve el equipo) y se borra cuando se retira o se pierde la verificación, cuando la sustituyes o cuando borras tu cuenta. Una foto rechazada se borra al momento. En Cruising y Videochat esto cambia lo que decíamos antes: la foto aprobada se borraba al revisarla.
- **Suspensiones graves** (menores, contenido sin consentimiento, contenido ilegal): a quién, por qué, la categoría, la app donde empezó y sus fechas. Si borras tu cuenta mientras hay una vigente, guardamos **solo un hash con clave (HMAC) de tu correo**, la categoría y la fecha de fin, sin nombre, cuenta ni denuncias, durante lo que dure la suspensión o **2 años** si era permanente. Solo sirve para negar la entrada a las apps +18 con ese correo, y se borra al caducar o si aceptamos una apelación enviada a ${mail}.
- **La vista del equipo:** los moderadores ven las denuncias y las suspensiones de una persona en las tres apps.

**Base jurídica.** Interés legítimo en proteger a los miembros y evitar abusos (artículo 6.1.f del RGPD). El equilibrio se sostiene porque un miembro espera razonablemente que quien ha sido expulsado por contenido sexual con menores no siga en una app hermana con la misma cuenta; solo se comparten medidas de seguridad y solo los moderadores ven el historial. Como usar estas apps puede revelar tu vida sexual u orientación sexual (artículo 9), este tratamiento se apoya además en el **consentimiento explícito** que das al entrar en cada app (artículo 9.2.a), que incluye que las medidas de seguridad (bloqueos, suspensiones graves, verificación) valen en todas las apps +18 de Codeqlick. Puedes oponerte o retirar tu consentimiento borrando tu cuenta o escribiendo a ${mail}.`,
};

const fr: Texts = {
  terms: () => `## Sécurité entre les applications 18+ de Codeqlick

Codeqlick propose trois applications 18+ avec le même compte : Cruising, Swipe et Videochat. Pour protéger leurs membres, certaines mesures de sécurité s'appliquent dans les trois. Seules celles-ci sont partagées : ton profil, tes photos, tes messages et ton activité restent dans chaque application.

- **Blocages.** Si tu bloques quelqu'un dans une application, vous êtes bloqués tous les deux dans les trois, dans les deux sens. Le débloquer lève le blocage dans les trois.
- **Suspensions graves.** Une suspension pour mineurs, contenu non consenti ou contenu illégal s'applique dans les trois applications, avec la même date de fin, et t'empêche aussi d'entrer dans une application que tu n'avais pas utilisée.
- **Vérification.** Tu te vérifies une seule fois : une photo de toi avec un papier portant ton nom dans l'application, « Codeqlick » et la date. Si l'équipe l'approuve, le badge « Vérifié » apparaît dans les trois applications. La photo est conservée en privé tant que la vérification est valable et seule l'équipe la voit ; elle est supprimée quand la vérification est retirée ou perdue, quand tu la remplaces ou quand tu supprimes ton compte. Le badge est aussi retiré quand une suspension grave commence.
- **Pas de retour avec un nouveau compte.** Si tu supprimes ton compte alors qu'une suspension grave s'applique, nous conservons un hachage à clé de ton e-mail (pas l'e-mail lui-même) pendant la durée de la suspension, ou 2 ans si elle était définitive, afin que ce compte ne puisse plus entrer dans les applications 18+. Si tu penses qu'il s'agit d'une erreur, écris-nous.
- **La vue de l'équipe.** Lors de la modération, l'équipe voit les signalements et les suspensions d'une personne dans les trois applications.`,
  privacy: (mail) => `## Sécurité entre les applications 18+ de Codeqlick

Codeqlick propose trois applications 18+ (Cruising, Swipe et Videochat) avec le même compte, et ne partage entre elles que des mesures de sécurité :

- **Blocages :** qui a bloqué qui et dans quelle application le blocage a été fait, pour qu'il s'applique dans les trois.
- **Vérification :** son statut et ses dates, le nom écrit sur le papier et la photo, qui est **conservée en privé tant que la vérification est valable** (seule l'équipe la voit) et supprimée quand la vérification est retirée ou perdue, quand tu la remplaces ou quand tu supprimes ton compte. Une photo refusée est supprimée immédiatement. Dans Cruising et Videochat, cela change ce que nous disions avant : une photo approuvée était supprimée une fois examinée.
- **Suspensions graves** (mineurs, contenu non consenti, contenu illégal) : qui, pourquoi, la catégorie, l'application où elle a commencé et ses dates. Si tu supprimes ton compte alors qu'une suspension de ce type s'applique, nous conservons **uniquement un hachage à clé (HMAC) de ton e-mail**, la catégorie et la date de fin, sans nom, compte ni signalements, pendant la durée de la suspension ou **2 ans** si elle était définitive. Il ne sert qu'à refuser l'entrée aux applications 18+ avec cet e-mail, et il est supprimé à son expiration ou si nous acceptons un recours envoyé à ${mail}.
- **La vue de l'équipe :** les modérateurs voient les signalements et les suspensions d'une personne dans les trois applications.

**Base juridique.** Intérêt légitime à protéger les membres et à prévenir les abus (article 6.1.f du RGPD). L'équilibre tient parce qu'un membre s'attend raisonnablement à ce que quelqu'un exclu pour un contenu sexuel impliquant des mineurs ne reste pas dans une application sœur avec le même compte ; seules des mesures de sécurité sont partagées et seuls les modérateurs voient l'historique. Comme l'utilisation de ces applications peut révéler ta vie sexuelle ou ton orientation sexuelle (article 9), ce traitement repose aussi sur le **consentement explicite** que tu donnes en entrant dans chaque application (article 9.2.a), qui inclut que les mesures de sécurité (blocages, suspensions graves, vérification) s'appliquent dans toutes les applications 18+ de Codeqlick. Tu peux t'y opposer ou retirer ton consentement en supprimant ton compte ou en écrivant à ${mail}.`,
};

const de: Texts = {
  terms: () => `## Sicherheit über die 18+-Apps von Codeqlick hinweg

Codeqlick betreibt drei 18+-Apps mit demselben Konto: Cruising, Swipe und Videochat. Um ihre Mitglieder zu schützen, gelten einige Sicherheitsmaßnahmen in allen drei. Nur diese werden geteilt: Dein Profil, deine Fotos, deine Nachrichten und deine Aktivität bleiben in der jeweiligen App.

- **Sperren.** Wenn du in einer App jemanden sperrst, seid ihr in allen drei Apps gegenseitig gesperrt. Hebst du die Sperre auf, gilt das ebenfalls in allen drei.
- **Schwere Sperrungen.** Eine Sperrung wegen Minderjähriger, nicht einvernehmlicher oder illegaler Inhalte gilt in allen drei Apps mit demselben Enddatum und hindert dich auch daran, eine App zu betreten, die du noch nicht genutzt hattest.
- **Verifizierung.** Du verifizierst dich nur einmal: ein Foto von dir mit einem Zettel, auf dem dein Name in der App, „Codeqlick“ und das Datum stehen. Genehmigt das Team es, erscheint das Abzeichen „Verifiziert“ in allen drei Apps. Das Foto wird privat aufbewahrt, solange die Verifizierung besteht, und nur das Team sieht es; es wird gelöscht, wenn die Verifizierung zurückgezogen wird oder verloren geht, wenn du sie ersetzt oder wenn du dein Konto löschst. Das Abzeichen wird auch entzogen, wenn eine schwere Sperrung beginnt.
- **Keine Rückkehr mit einem neuen Konto.** Wenn du dein Konto löschst, während eine schwere Sperrung gilt, speichern wir einen Hash mit Schlüssel deiner E-Mail-Adresse (nicht die Adresse selbst) für die Dauer der Sperrung, bei dauerhafter Sperrung für 2 Jahre, damit dieses Konto die 18+-Apps nicht erneut betreten kann. Wenn du glaubst, dass es ein Irrtum ist, schreib uns.
- **Die Sicht des Teams.** Bei der Moderation sieht das Team die Meldungen und Sperrungen einer Person in allen drei Apps.`,
  privacy: (mail) => `## Sicherheit über die 18+-Apps von Codeqlick hinweg

Codeqlick betreibt drei 18+-Apps (Cruising, Swipe und Videochat) mit demselben Konto und teilt zwischen ihnen nur Sicherheitsmaßnahmen:

- **Sperren:** wer wen gesperrt hat und in welcher App die Sperre erfolgte, damit sie in allen dreien gilt.
- **Verifizierung:** ihr Status und ihre Daten, der auf den Zettel geschriebene Name und das Foto, das **privat aufbewahrt wird, solange die Verifizierung besteht** (nur das Team sieht es) und gelöscht wird, wenn die Verifizierung zurückgezogen wird oder verloren geht, wenn du sie ersetzt oder wenn du dein Konto löschst. Ein abgelehntes Foto wird sofort gelöscht. In Cruising und Videochat ändert das, was wir früher sagten: Ein genehmigtes Foto wurde nach der Prüfung gelöscht.
- **Schwere Sperrungen** (Minderjährige, nicht einvernehmliche Inhalte, illegale Inhalte): wer, warum, die Kategorie, die App, in der sie begann, und ihre Daten. Wenn du dein Konto löschst, während eine gilt, speichern wir **nur einen Hash mit Schlüssel (HMAC) deiner E-Mail-Adresse**, die Kategorie und das Enddatum, ohne Namen, Konto oder Meldungen, für die Dauer der Sperrung oder **2 Jahre**, wenn sie dauerhaft war. Er dient nur dazu, den Zugang zu den 18+-Apps mit dieser Adresse zu verweigern, und wird bei Ablauf gelöscht oder wenn wir einen an ${mail} gesendeten Einspruch annehmen.
- **Die Sicht des Teams:** Moderatoren sehen die Meldungen und Sperrungen einer Person in allen drei Apps.

**Rechtsgrundlage.** Berechtigtes Interesse am Schutz der Mitglieder und an der Missbrauchsverhinderung (Art. 6 Abs. 1 lit. f DSGVO). Die Abwägung trägt, weil ein Mitglied vernünftigerweise erwartet, dass jemand, der wegen sexueller Inhalte mit Minderjährigen entfernt wurde, nicht in einer Schwester-App mit demselben Konto bleibt; es werden nur Sicherheitsmaßnahmen geteilt, und nur Moderatoren sehen den Verlauf. Da die Nutzung dieser Apps dein Sexualleben oder deine sexuelle Orientierung offenbaren kann (Art. 9), beruht diese Verarbeitung zusätzlich auf der **ausdrücklichen Einwilligung**, die du beim Betreten jeder App gibst (Art. 9 Abs. 2 lit. a), und die einschließt, dass Sicherheitsmaßnahmen (Sperren, schwere Sperrungen, Verifizierung) in allen 18+-Apps von Codeqlick gelten. Du kannst widersprechen oder deine Einwilligung widerrufen, indem du dein Konto löschst oder an ${mail} schreibst.`,
};

const it: Texts = {
  terms: () => `## Sicurezza tra le app 18+ di Codeqlick

Codeqlick gestisce tre app 18+ con lo stesso account: Cruising, Swipe e Videochat. Per proteggere i loro membri, alcune misure di sicurezza valgono in tutte e tre. Si condividono solo queste: il tuo profilo, le tue foto, i tuoi messaggi e la tua attività restano in ciascuna app.

- **Blocchi.** Se blocchi qualcuno in un'app, tu e quella persona siete bloccati in tutte e tre, in entrambi i sensi. Sbloccarla toglie il blocco in tutte e tre.
- **Sospensioni gravi.** Una sospensione per minori, contenuti non consensuali o contenuti illegali vale in tutte e tre le app, con la stessa data di fine, e ti impedisce anche di entrare in un'app che non avevi usato.
- **Verifica.** Ti verifichi una sola volta: una foto di te con un foglio che riporta il tuo nome nell'app, «Codeqlick» e la data. Se il team la approva, il badge «Verificato» compare in tutte e tre le app. La foto è conservata in privato finché la verifica è valida e solo il team la vede; viene eliminata quando la verifica è ritirata o persa, quando la sostituisci o quando elimini il tuo account. Il badge viene tolto anche quando inizia una sospensione grave.
- **Niente ritorno con un nuovo account.** Se elimini il tuo account mentre vale una sospensione grave, conserviamo un hash con chiave della tua e-mail (non l'e-mail) per la durata della sospensione, o 2 anni se era permanente, perché quell'account non possa più entrare nelle app 18+. Se pensi che sia un errore, scrivici.
- **La vista del team.** Quando modera, il team vede le segnalazioni e le sospensioni di una persona nelle tre app.`,
  privacy: (mail) => `## Sicurezza tra le app 18+ di Codeqlick

Codeqlick gestisce tre app 18+ (Cruising, Swipe e Videochat) con lo stesso account e tra di esse condivide solo misure di sicurezza:

- **Blocchi:** chi ha bloccato chi e in quale app è stato fatto il blocco, perché valga in tutte e tre.
- **Verifica:** il suo stato e le sue date, il nome scritto sul foglio e la foto, che viene **conservata in privato finché la verifica è valida** (solo il team la vede) ed eliminata quando la verifica è ritirata o persa, quando la sostituisci o quando elimini il tuo account. Una foto rifiutata viene eliminata subito. In Cruising e Videochat questo cambia ciò che dicevamo prima: una foto approvata veniva eliminata una volta esaminata.
- **Sospensioni gravi** (minori, contenuti non consensuali, contenuti illegali): chi, perché, la categoria, l'app in cui è iniziata e le sue date. Se elimini il tuo account mentre ne vale una, conserviamo **solo un hash con chiave (HMAC) della tua e-mail**, la categoria e la data di fine, senza nome, account né segnalazioni, per la durata della sospensione o **2 anni** se era permanente. Serve solo a negare l'ingresso alle app 18+ con quell'e-mail, ed è eliminato alla scadenza o se accettiamo un ricorso inviato a ${mail}.
- **La vista del team:** i moderatori vedono le segnalazioni e le sospensioni di una persona nelle tre app.

**Base giuridica.** Legittimo interesse a proteggere i membri e a prevenire gli abusi (articolo 6.1.f del GDPR). L'equilibrio regge perché un membro si aspetta ragionevolmente che chi è stato escluso per contenuti sessuali che coinvolgono minori non resti in un'app sorella con lo stesso account; si condividono solo misure di sicurezza e solo i moderatori vedono la cronologia. Poiché usare queste app può rivelare la tua vita sessuale o il tuo orientamento sessuale (articolo 9), questo trattamento si fonda anche sul **consenso esplicito** che dai entrando in ciascuna app (articolo 9.2.a), che include che le misure di sicurezza (blocchi, sospensioni gravi, verifica) valgono in tutte le app 18+ di Codeqlick. Puoi opporti o revocare il consenso eliminando il tuo account o scrivendo a ${mail}.`,
};

const pt: Texts = {
  terms: () => `## Segurança entre as apps 18+ da Codeqlick

A Codeqlick tem três apps 18+ com a mesma conta: Cruising, Swipe e Videochat. Para proteger os seus membros, algumas medidas de segurança valem nas três. Só estas são partilhadas: o teu perfil, as tuas fotos, as tuas mensagens e a tua atividade ficam em cada app.

- **Bloqueios.** Se bloqueares alguém numa app, tu e essa pessoa ficam bloqueados nas três, nos dois sentidos. Desbloqueá-la levanta o bloqueio nas três.
- **Suspensões graves.** Uma suspensão por menores, conteúdo sem consentimento ou conteúdo ilegal vale nas três apps, com a mesma data de fim, e impede-te também de entrar numa app que não tinhas usado.
- **Verificação.** Verificas-te uma só vez: uma foto tua com um papel com o teu nome na app, «Codeqlick» e a data. Se a equipa a aprovar, o selo «Verificado» aparece nas três apps. A foto é guardada em privado enquanto a verificação se mantiver e só a equipa a vê; é eliminada quando a verificação é retirada ou perdida, quando a substituis ou quando eliminas a tua conta. O selo também é retirado quando começa uma suspensão grave.
- **Sem voltar com uma conta nova.** Se eliminares a tua conta enquanto houver uma suspensão grave, guardamos um hash com chave do teu e-mail (não o e-mail) durante o tempo da suspensão, ou 2 anos se era permanente, para que essa conta não possa voltar a entrar nas apps 18+. Se achas que é um engano, escreve-nos.
- **A vista da equipa.** Ao moderar, a equipa vê as denúncias e as suspensões de uma pessoa nas três apps.`,
  privacy: (mail) => `## Segurança entre as apps 18+ da Codeqlick

A Codeqlick tem três apps 18+ (Cruising, Swipe e Videochat) com a mesma conta e partilha entre elas apenas medidas de segurança:

- **Bloqueios:** quem bloqueou quem e em que app foi feito o bloqueio, para que valha nas três.
- **Verificação:** o seu estado e as suas datas, o nome escrito no papel e a foto, que é **guardada em privado enquanto a verificação se mantiver** (só a equipa a vê) e eliminada quando a verificação é retirada ou perdida, quando a substituis ou quando eliminas a tua conta. Uma foto rejeitada é eliminada de imediato. No Cruising e no Videochat isto muda o que dizíamos antes: uma foto aprovada era eliminada depois de revista.
- **Suspensões graves** (menores, conteúdo sem consentimento, conteúdo ilegal): a quem, porquê, a categoria, a app onde começou e as suas datas. Se eliminares a tua conta enquanto houver uma em vigor, guardamos **apenas um hash com chave (HMAC) do teu e-mail**, a categoria e a data de fim, sem nome, conta nem denúncias, durante o tempo da suspensão ou **2 anos** se era permanente. Serve apenas para recusar a entrada nas apps 18+ com esse e-mail, e é eliminado ao caducar ou se aceitarmos um recurso enviado para ${mail}.
- **A vista da equipa:** os moderadores veem as denúncias e as suspensões de uma pessoa nas três apps.

**Base jurídica.** Interesse legítimo em proteger os membros e prevenir abusos (artigo 6.º, n.º 1, alínea f), do RGPD). O equilíbrio mantém-se porque um membro espera razoavelmente que quem foi expulso por conteúdo sexual que envolve menores não continue numa app irmã com a mesma conta; só se partilham medidas de segurança e só os moderadores veem o histórico. Como usar estas apps pode revelar a tua vida sexual ou orientação sexual (artigo 9.º), este tratamento assenta ainda no **consentimento explícito** que dás ao entrar em cada app (artigo 9.º, n.º 2, alínea a)), que inclui que as medidas de segurança (bloqueios, suspensões graves, verificação) valem em todas as apps 18+ da Codeqlick. Podes opor-te ou retirar o teu consentimento eliminando a tua conta ou escrevendo para ${mail}.`,
};

const TEXTS: Record<AppLocale, Texts> = { en, es, fr, de, it, pt };

/** The section for one page, in the page's language, ready to append to its markdown. */
export function adultSafetySection(kind: AdultSafetyKind, locale: AppLocale, mail: string): string {
  return TEXTS[locale][kind](mail);
}
