import type { CruisingLegalTexts } from '../cruising';

/** Cruising's terms of use and privacy policy in German. */
export const de: CruisingLegalTexts = {
  updated: '16. November 2026',
  owner: {
    owner: 'Inhaber',
    taxId: 'Steuernummer (NIF)',
    address: 'Anschrift',
    email: 'E-Mail',
    website: 'Website',
  },
  terms: {
    title: 'Nutzungsbedingungen von Cruising',
    description:
      'Wer Cruising nutzen darf, was beigetragen werden darf, wie wir moderieren und wie du gehst.',
    markdown: (c) => `## Wer den Dienst anbietet

Cruising (cruising.codeqlick.com) ist ein Dienst von:

${c.ownerLines}

## Was es ist

Ein Verzeichnis von Treffpunkten zwischen Männern, mit einer Karte und Bewertungen von Erwachsenen. Es ist weder ein Reiseführer noch ein Dating-Dienst: Es sammelt nur, was Mitglieder beitragen, und wir prüfen es vor der Veröffentlichung.

## Nur für Erwachsene (18+)

Wenn du einen Ort vorschlägst, bewertest oder eine Meldung machst, erklärst du, dass du mindestens 18 Jahre alt bist (und in deinem Land volljährig, falls die Altersgrenze dort höher liegt). Du kannst die Karte und die Seiten ohne Konto ansehen, aber dieser Dienst handelt von der Sexualität Erwachsener: Wenn du nicht volljährig bist, nutze ihn nicht. Wir schließen jedes Konto, von dem wir annehmen, dass es einer minderjährigen Person gehört.

## Dein Konto

Du brauchst ein Konto mit einer bestätigten E-Mail-Adresse und musst Cruising mit deinem Geburtsdatum, den Regeln und deiner Einwilligung betreten. Du bist dafür verantwortlich, was du damit tust.

## Was du beiträgst

- Orte, die es gibt und die du kennst, mit wahren Angaben: Name, Art, Lage, Beschreibung und beste Zeiten.
- **Niemals** in der Nähe von Schulen, Spielplätzen oder Orten, an denen sich Kinder aufhalten. Im Zweifel lehnen wir ab.
- Ehrliche, respektvolle Bewertungen, ohne Kontaktdaten (Telefonnummern, E-Mail-Adressen, Links oder andere Apps), ohne Personen identifizierbar zu machen und ohne Fotos von Personen ohne deren Einwilligung.
- Das Team prüft jeden Ort vor der Veröffentlichung und kann ihn korrigieren. Bewertungen werden sofort veröffentlicht und von uns nachträglich moderiert.
- Was du schreibst, gehört weiterhin dir. Du erteilst uns eine unentgeltliche, nicht ausschließliche Erlaubnis, es zu speichern und in Cruising anzuzeigen, bis du es löschst.

## Fotos und Videos

- Mitglieder, die Cruising betreten haben und **verifiziert** sind, können Fotos und Videos **von sich selbst** in ihr Profil hochladen. Sexuelle Inhalte von sich selbst unter Erwachsenen sind erlaubt, und nur Mitglieder, die Cruising betreten haben, können sie sehen.
- **Niemand unter 18** darf darauf zu sehen sein, und nichts darf illegal sein. Niemand darf darauf zu sehen sein, der nicht eingewilligt hat, und die Bilder müssen deine eigenen sein. Bei jedem Hochladen setzt du ein Häkchen zur Einwilligung.
- Fotos und Videos werden **veröffentlicht, bevor das Team sie prüft**; das Team prüft sie danach und entfernt, was gegen diese Bedingungen verstößt, wobei es das Bild sperrt, damit es nicht erneut hochgeladen werden kann. Wir können das Konto sperren.
- Die **Verifizierung** ist ein Foto von dir mit deinem Nickname, das vom Team geprüft und danach gelöscht wird. Das Abzeichen „Verifiziert“ bedeutet nur, dass das Team dieses Foto geprüft hat: nicht, dass ein Ausweisdokument geprüft wurde.
- Was du hochlädst, gehört weiterhin dir, und du erteilst uns eine unentgeltliche, nicht ausschließliche Erlaubnis, es zu speichern und in Cruising anzuzeigen, bis du es löschst.

## Wie du dich verhältst

Respektiere die anderen, den Ort und das Gesetz dort, wo du bist. Kein Verkauf von Sex oder Drogen, keine Belästigung, Drohungen, Erpressung oder Diskriminierung. Wenn etwas gefährlich oder illegal ist, melde es. Die vollständigen Regeln findest du unter [Regeln](/${c.locale}/cruising/rules).

## Moderation, Meldungen und Entfernung

Du kannst jeden Ort, jede Bewertung, jedes Profil, jedes Foto und jedes Video melden. Eine Meldung wegen einer minderjährigen Person, einer fehlenden Einwilligung, gestohlener Bilder oder illegaler Inhalte blendet den Inhalt sofort aus, bis wir ihn geprüft haben. Jede Person, auch ohne Konto, kann uns unter [cruising.codeqlick.com/${c.locale}/takedown](/${c.locale}/cruising/takedown) bitten, einen Ort zu entfernen; wenn es um eine minderjährige Person oder etwas Illegales geht und der Link angegeben wird, blenden wir ihn sofort aus, und wir antworten immer innerhalb von 24 Stunden. Ein durch die Moderation entfernter Ort kann nicht erneut eingereicht werden. Wenn wir etwas von dir entfernen oder dein Konto sperren, schicken wir dir den Grund per E-Mail, und du kannst antworten, um eine erneute Prüfung zu verlangen (Gesetz über digitale Dienste (DSA)).

## Was wir nicht garantieren

Cruising ist kostenlos und wird so angeboten, wie es ist. Die Informationen stammen von Mitgliedern: Sie können falsch, veraltet oder verändert sein, und ein Ort kann gefährlich sein oder überwacht werden. Irgendwohin zu gehen ist deine Entscheidung und deine Verantwortung. Wir haften nicht für das, was außerhalb unserer Kontrolle liegt, außer soweit das Gesetz einen Haftungsausschluss nicht zulässt.

## Änderungen und Austritt

Wir können diese Bedingungen ändern; bei einer wichtigen Änderung bitten wir dich, sie beim Betreten erneut zu akzeptieren. Du kannst jederzeit gehen, indem du dein Konto unter „Mein Konto“ löschst: Dein Profil, deine Bewertungen und deine Meldungen werden gelöscht, und die Orte, die du vorgeschlagen hast, bleiben ohne deinen Namen veröffentlicht.

## Anwendbares Recht

Diese Bedingungen unterliegen spanischem Recht. Für Fragen oder Beschwerden schreib uns an ${c.mail}.`,
  },
  privacy: {
    title: 'Datenschutzerklärung von Cruising',
    description:
      'Welche Daten Cruising verarbeitet, auf welcher Rechtsgrundlage, wie lange und wie du deine Rechte ausübst.',
    markdown: (c) => `## Verantwortlicher

${c.ownerLines}

## Besonders geschützte Daten

Die Nutzung von Cruising kann Aspekte deines **Sexuallebens oder deiner sexuellen Orientierung** offenbaren, also besondere Kategorien personenbezogener Daten (Art. 9 DSGVO). Wir verarbeiten sie nur mit deiner **ausdrücklichen Einwilligung** (Art. 9 Abs. 2 lit. a DSGVO), die du erteilst, indem du beim Betreten von Cruising ein eigenes Kästchen ankreuzt. Du kannst sie jederzeit widerrufen, indem du dein Konto löschst. Um die Karte und die Seiten ohne Konto anzusehen, brauchen wir keine Daten von dir.

## Welche Daten wir verarbeiten und warum

- **Konto:** Name, E-Mail-Adresse, Passwort (verschlüsselt) und Sprache, um dir Zugang zu geben (Art. 6 Abs. 1 lit. b DSGVO).
- **Alter:** Du gibst beim Betreten dein Geburtsdatum an, aber **wir speichern nur das Jahr**.
- **Betreten:** die Version der Regeln, die du akzeptiert hast, und wann, sowie ob du E-Mail-Benachrichtigungen aktiviert hast.
- **Orte:** die, die du vorschlägst (Name, Art, Lage, Beschreibung, Zeiten), mit deinem Konto verknüpft, damit du sie sehen und bearbeiten kannst und wir sie moderieren können.
- **Bewertungen und Meldungen:** die, die du schreibst und machst.
- **Fotos und Videos (besondere Kategorie von Daten):** die, die du in dein Profil hochlädst, mit deiner **ausdrücklichen Einwilligung** bei jedem Hochladen (Art. 9 Abs. 2 lit. a DSGVO). Wir entfernen ihre Metadaten (Standort, Kamera). Sie werden auf Servern in der Europäischen Union (OVHcloud) gespeichert, **außerhalb der Backups**, und nur Mitglieder, die Cruising betreten haben, können sie sehen, niemals Suchmaschinen.
- **Verifizierungsfoto:** das, das du uns mit deinem Nickname schickst; nur das Team sieht es, und es wird **gelöscht, sobald es geprüft ist**: Wir speichern nur die Entscheidung.
- **Sexuelle Gesundheit (Gesundheitsdaten, besondere Kategorie):** nur wenn du sie aktivierst, mit einer **eigenen ausdrücklichen Einwilligung** (Art. 9 Abs. 2 lit. a DSGVO), getrennt von der beim Betreten: ob du PrEP nimmst, der Monat deines letzten Tests und wie oft wir dich an deinen Check-up erinnern sollen. Standardmäßig siehst nur du sie; wenn du sie anzeigen möchtest, sehen Mitglieder, die Cruising betreten haben, sie in deinem Profil. Wenn du die Funktion deaktivierst, werden sie sofort **gelöscht**. Erinnerungen sagen nur „Zeit für deinen Check-up“.
- **Vertrauenspersonen und der Sicherheits-Timer:** die E-Mail-Adresse von bis zu 2 Personen, die du auswählst, der Name, den du dir ihnen gegenüber gibst, und ob sie zugestimmt haben (berechtigtes Interesse an deiner Sicherheit, Art. 6 Abs. 1 lit. f DSGVO; jede Vertrauensperson erteilt ihre eigene Einwilligung, indem sie per E-Mail zustimmt, und kann jederzeit aufhören). Von einem Timer speichern wir seine Endzeit, deine Nachricht und, nur wenn du ihn teilen möchtest, den Ort. Wenn du ihn nicht rechtzeitig beendest, erhalten deine Vertrauenspersonen, die zugestimmt haben, eine einzige E-Mail mit diesem Namen, deiner Nachricht, der Uhrzeit und dem geteilten Ort; niemals deinen Nickname oder was Cruising ist.
- **Sicherheit:** die IP-Adresse und der Browser jeder Sitzung (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO).
- **Dein Standort:** Wenn du auf „Mich orten“ tippst, zentriert dein Browser die Karte auf deinen Standort. **Dieser Standort verlässt niemals dein Gerät: Er wird weder gesendet noch gespeichert.**

## E-Mails

Wir schreiben dir, wenn das Team einen deiner Orte veröffentlicht oder ablehnt oder dein Konto sperrt. E-Mails enthalten niemals den Namen oder Inhalt des Ortes. Die Benachrichtigung „Ort veröffentlicht“ kannst du in deinem Profil deaktivieren; die Entscheidungen des Teams werden immer gesendet.

## Die Karte

Die Bilder der Karte lädt dein Browser direkt von den Servern der **OpenStreetMap Foundation**, die deine IP-Adresse und den Bereich erhalten, den du ansiehst. Dafür gilt ihre [Datenschutzerklärung](https://wiki.osmfoundation.org/wiki/Privacy_Policy). Die Karte ist © OpenStreetMap-Mitwirkende.

## Wer deine Daten sieht

Veröffentlichte Orte sieht jede Person, ohne deinen Namen. Bewertungen sehen nur Mitglieder, die Cruising betreten haben, als „Mitglied“. Dein Name und deine E-Mail-Adresse werden niemals angezeigt. Wir verkaufen keine Daten und geben sie an niemanden weiter, es sei denn, das Gesetz verlangt es (zum Beispiel ein Gerichtsbeschluss oder um Inhalte mit Minderjährigen zu melden). Der einzige Auftragsverarbeiter ist **OVHcloud**, das den Dienst, die Datenbank und die E-Mails auf Servern in der Europäischen Union hostet.

## Wie lange wir sie speichern

Solange du das Konto hast. Deine Fotos und Videos, bis du sie oder das Konto löschst; die Dateien sind innerhalb von 6 Stunden vom Server verschwunden. Das Verifizierungsfoto wird nach der Prüfung gelöscht. Timer, 7 Tage nach ihrem Ende. Wenn du das Konto löschst, werden dein Profil, deine Bewertungen, Meldungen, Gesundheitsdaten, Vertrauenspersonen und Timer gelöscht; die Orte, die du vorgeschlagen hast, bleiben ohne deinen Namen veröffentlicht. Backups werden nach 14 Tagen entfernt.

## Deine Rechte

Du kannst deine Daten unter „Mein Konto“ herunterladen und dein Konto löschen. Du kannst uns auch bitten, Auskunft über deine Daten zu geben, sie zu berichtigen oder zu löschen, ihre Verarbeitung einzuschränken oder ihr zu widersprechen, oder sie in einem übertragbaren Format zu erhalten, indem du an ${c.mail} schreibst. Wenn du meinst, dass wir sie nicht korrekt verarbeitet haben, kannst du dich bei der spanischen Datenschutzbehörde (Agencia Española de Protección de Datos, [aepd.es](https://www.aepd.es)) beschweren.

## Cookies

Nur technische Cookies: \`NEXT_LOCALE\` (Sprache) und \`cq_at\` / \`cq_rt\` (angemeldet). Keine Werbung.`,
  },
};
