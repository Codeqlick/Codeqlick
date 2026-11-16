import type { CruisingLegalTexts } from '../cruising';

/** Cruising's terms of use and privacy policy in English (the source of the other languages). */
export const en: CruisingLegalTexts = {
  updated: '16 November 2026',
  owner: {
    owner: 'Owner',
    taxId: 'Tax ID',
    address: 'Address',
    email: 'Email',
    website: 'Website',
  },
  terms: {
    title: 'Cruising terms of use',
    description: 'Who can use Cruising, what can be contributed, how we moderate and how to leave.',
    markdown: (c) => `## Who provides the service

Cruising (cruising.codeqlick.com) is a service of:

${c.ownerLines}

## What it is

A directory of meeting places between men, with a map and reviews by adults. It is not a travel guide or a dating service: it only gathers what members contribute, which we review before publishing.

## Adults only (18+)

To propose a place, review one or report, you declare that you are at least 18 (and of legal age in your country, if higher). You can look at the map and the pages without an account, but this service is about adult sexuality: if you are not an adult, do not use it. We close any account we believe belongs to a minor.

## Your account

You need an account with a verified email, and to enter Cruising with your date of birth, the rules and your consent. You are responsible for what you do with it.

## What you contribute

- Places that exist and that you know, with true details: name, type, location, description and best times.
- **Never** near schools, playgrounds or places where children go. When in doubt, we reject it.
- Honest, respectful reviews, with no contact details (phone numbers, emails, links or other apps), without identifying people and without photos of people without their consent.
- The team reviews every place before it is published and may correct it. Reviews are published at once and we moderate them afterwards.
- You still own what you write. You give us a free, non-exclusive permission to store it and show it in Cruising until you delete it.

## Photos and videos

- Members who have entered and are **verified** can upload photos and videos **of themselves** to their profile. Sexual content of oneself between adults is allowed, and only members who have entered can see it.
- **Nobody under 18** may appear, and nothing may be illegal. Nobody who didn't consent may appear, and the pictures must be yours. You tick a consent box at each upload.
- Photos and videos are **published before the team reviews them**; the team reviews them afterwards and removes what breaks these terms, blocking the image so it can't be uploaded again. We may suspend the account.
- **Verification** is a photo of you with your nickname, reviewed by the team and deleted afterwards. The "Verified" badge only means the team checked that photo: not that an identity document was checked.
- You still own what you upload and give us a free, non-exclusive permission to store it and show it in Cruising until you delete it.

## How you behave

Respect others, the place and the law where you are. No selling sex or drugs, harassment, threats, blackmail or discrimination. If something is dangerous or illegal, report it. The full rules are in [Rules](/${c.locale}/cruising/rules).

## Moderation, reports and removal

You can report any place, review, profile, photo or video. A report for a minor, a missing consent, stolen pictures or illegal content hides it at once until we review it. Anyone, even without an account, can ask us to remove a place at [cruising.codeqlick.com/${c.locale}/takedown](/${c.locale}/cruising/takedown); when it is about a minor or something illegal and they give the link, we hide it at once, and we always answer within 24 hours. A place removed by moderation can't be sent again. If we remove something of yours or suspend your account, we email you the reason and you can reply to ask us to review it (Digital Services Act).

## What we don't guarantee

Cruising is free and offered as is. The information comes from members: it can be wrong, out of date or changed, and a place can be dangerous or watched. Going somewhere is your decision and your responsibility. We are not liable for what is beyond our control, except where the law does not allow it to be excluded.

## Changes and leaving

We may change these terms; for an important change we will ask you to accept them again when you enter. You can leave whenever you like by deleting your account in "My account": your profile, reviews and reports are deleted, and the places you proposed stay published without your name.

## Governing law

These terms are governed by Spanish law. For any question or complaint, write to us at ${c.mail}.`,
  },
  privacy: {
    title: 'Cruising privacy policy',
    description:
      'What data Cruising handles, on what legal basis, for how long and how to use your rights.',
    markdown: (c) => `## Data controller

${c.ownerLines}

## Specially protected data

Using Cruising can reveal aspects of your **sex life or sexual orientation**, special category data (article 9 of the GDPR). We only handle it with your **explicit consent** (article 9.2.a), which you give by ticking a separate box when you enter Cruising. You can withdraw it whenever you like by deleting your account. Looking at the map and the pages without an account needs no data from you.

## What data we handle and why

- **Account:** name, email, password (encrypted) and language, to give you access (article 6.1.b).
- **Age:** you give your date of birth when you enter, but **we only keep the year**.
- **Entry:** the version of the rules you accepted and when, and whether you turned on email alerts.
- **Places:** the ones you propose (name, type, location, description, times) with your account, so you can see and edit them and so we can moderate them.
- **Reviews and reports:** the ones you write and make.
- **Photos and videos (special category data):** the ones you upload to your profile, with your **explicit consent** at each upload (article 9.2.a). We strip their metadata (location, camera). They are stored on servers in the European Union (OVHcloud), **out of backups**, and only members who have entered can see them, never search engines.
- **Verification photo:** the one you send us with your nickname; only the team sees it and it is **deleted as soon as it is reviewed**: we only keep the decision.
- **Sexual health (health data, special category):** only if you turn it on, with its **own explicit consent** (article 9.2.a), separate from entry's: whether you take PrEP, the month of your last test and how often to remind you of your check-up. By default only you see them; if you choose to show them, members who have entered see them on your profile. Turning it off **deletes** them at once. Reminders only say "Time for your check-up".
- **Trusted contacts and the safety timer:** the email of up to 2 people you choose, the name you give yourself for them, and whether they accepted (legitimate interest in your safety, article 6.1.f; each contact gives their own consent by accepting by email and can stop at any time). Of a timer we keep its end time, your message and, only if you choose to share it, the place. If you don't end it in time, your contacts who accepted get a single email with that name, your message, the time and the shared place; never your nickname or what Cruising is.
- **Security:** the IP address and browser of each session (legitimate interest, article 6.1.f).
- **Your position:** if you press "Locate me", your browser centres the map on your position. **That position never leaves your device: it is not sent or stored.**

## Emails

We write to you when the team publishes or rejects a place of yours, or suspends your account. Emails never include the place's name or content. You can turn off the "place published" alert in your profile; the team's decisions are always sent.

## The map

The map's pictures are loaded by your browser directly from the servers of the **OpenStreetMap Foundation**, which receive your IP address and the area you are looking at. They are governed by their [privacy policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy). The map is © OpenStreetMap contributors.

## Who sees your data

Published places are seen by anyone, without your name. Reviews are seen only by members who have entered, as "Member". Your name and email are never shown. We don't sell or hand data to anyone, unless the law requires it (for example a court order, or to report content involving minors). The only data processor is **OVHcloud**, which hosts the service, the database and the email on servers in the European Union.

## How long we keep it

As long as you have the account. Your photos and videos, until you delete them or the account; the files are gone from the server within 6 hours. The verification photo is deleted once reviewed. Timers, 7 days after they end. When you delete the account, your profile, reviews, reports, health data, trusted contacts and timers are deleted; the places you proposed stay published without your name. Backups are removed after 14 days.

## Your rights

You can download your data and delete your account from "My account". You can also ask us to access, correct or delete your data, to restrict or object to its processing, or to receive it in a portable format by writing to ${c.mail}. If you think we haven't handled it properly, you can complain to the Spanish Data Protection Agency ([aepd.es](https://www.aepd.es)).

## Cookies

Only technical cookies: \`NEXT_LOCALE\` (language) and \`cq_at\` / \`cq_rt\` (signed in). No advertising.`,
  },
};
