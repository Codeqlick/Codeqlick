import type { CruisingCopy } from './types.js';

/** Cruising's emails and push texts in English (the source of the other languages). */
export const en: CruisingCopy = {
  takedown: {
    receivedSubject: 'We received your removal request',
    receivedTitle: 'Request received',
    received:
      'We received your removal request for Cruising. If it is about a minor or something illegal (or, for a photo or video, missing consent or a stolen image) and it matched something published, it is hidden already. We review it and answer within 24 hours.',
    removedSubject: 'We removed the content',
    removedTitle: 'Content removed',
    removed: 'We reviewed your request and removed what you asked about.',
    closedSubject: 'We reviewed your removal request',
    closedTitle: 'Request reviewed',
    closed: 'We reviewed your request and did not remove anything.',
    answer: "The team's answer",
    reference: 'Request reference',
  },
  notice: {
    'spot-live': {
      subject: 'Your spot is live',
      body: 'We reviewed one of the spots you proposed and it is live on the map.',
      button: 'See my spots',
    },
    'spot-rejected': {
      subject: "We didn't publish one of your spots",
      body: "We reviewed one of the spots you proposed and didn't publish it. This is why:",
      button: 'See my spots',
    },
    'spot-removed': {
      subject: 'We removed one of your spots',
      body: 'After a report, we removed one of the spots you proposed. The removal is final. This is why:',
      button: 'See my spots',
    },
    suspended: {
      subject: 'Your Cruising account is suspended',
      body: 'We suspended your Cruising account. You can still browse the map, but not propose spots, write reviews, send reports, check in or send messages.',
      button: 'Read the rules',
    },
    unread: {
      subject: 'You have an unread message',
      body: "Someone wrote to you in Cruising and you haven't read it yet.",
      button: 'Read the message',
    },
    'verification-approved': {
      subject: 'Your profile is verified',
      body: 'We reviewed your verification photo: your profile carries the "Verified" badge and you can upload photos and videos.',
      button: 'Go to my profile',
    },
    'verification-rejected': {
      subject: "We couldn't verify your profile",
      body: "We reviewed your verification photo and didn't approve it. We deleted the photo. You can send another one. This is why:",
      button: 'Go to my profile',
    },
    'verification-withdrawn': {
      subject: 'Your profile is no longer verified',
      body: 'The team withdrew the verification of your profile: it no longer carries the "Verified" badge and you can no longer upload photos or videos.',
      button: 'Read the rules',
    },
    'media-removed': {
      subject: 'We removed one of your photos or videos',
      body: "After reviewing it, we removed a photo or video from your profile, and it can't be uploaded again. This is why:",
      button: 'Go to my profile',
    },
    favorites: {
      subject: "There's activity at your favourite spots",
      body: "There's activity at your favourite spots.",
      button: 'See my favourites',
    },
    'meetup-cancelled': {
      subject: 'A meetup was cancelled',
      body: 'A Cruising meetup you said you were going to was cancelled.',
      button: 'See the meetups',
    },
    reasonTitle: 'Reason',
    until: 'Until',
    permanent: 'Until the team lifts it',
    settings: 'You can stop this email in your Cruising profile.',
  },
  invite: {
    subject: (name) => `${name} asked you to receive their Codeqlick safety alerts`,
    title: 'Codeqlick safety alerts',
    intro: (name) => [
      `${name} would like you to be one of their trusted contacts for Codeqlick safety alerts.`,
      `When ${name} goes out to meet someone, they can start a safety timer. If they don't end it in time, we email you their message, the time and, if they choose to share it, the place, so you can check they're OK.`,
      "You'll get nothing else from us, and you can stop at any time.",
    ],
    button: 'Accept or refuse',
    outro: (stopUrl) => [`Stop these alerts at any time: ${stopUrl}`],
    note: (name) =>
      `If you don't know ${name} or don't want this, refuse it or ignore this email: nothing will be sent to you.`,
  },
  alert: {
    subject: (name) => `Codeqlick safety alert: ${name} hasn't checked in`,
    title: 'Codeqlick safety alert',
    intro: (name) => [
      `${name} started a safety timer and didn't end it in time. They asked us to tell you, so you can check they're OK.`,
      'Try to reach them. If you think they are in danger, call the emergency services (112 in Europe).',
    ],
    message: 'Their message',
    time: 'Ran out at',
    place: 'Place',
    map: 'Map',
    button: 'See the place on a map',
    outro: (stopUrl) => [`Stop these alerts: ${stopUrl}`],
    note: 'You get this because you accepted to be a trusted contact. This is the only email this timer sends.',
  },
  member: {
    timer: {
      subject: 'Your safety timer ends in 10 minutes',
      body: "Extend it or end it if you're fine. If it runs out, your trusted contacts get an email.",
      button: 'Open my timer',
    },
    health: {
      subject: 'Time for your check-up',
      body: 'Time for your check-up.',
      button: 'Find a testing centre',
    },
    settings: 'You can change this in your Cruising profile.',
  },
  safetyPush: { timer: 'Your safety timer ends in 10 minutes', health: 'Time for your check-up' },
  push: {
    favorite: 'Someone is at one of your favourite spots',
    message: 'New message',
    meetup: 'A meetup was planned at one of your favourite spots',
    safety: 'Safety alert at one of your favourite spots',
    'meetup-cancelled': 'A meetup you joined was cancelled',
    album: 'Someone shared their private album with you',
    wink: 'Someone winked at you',
  },
};
