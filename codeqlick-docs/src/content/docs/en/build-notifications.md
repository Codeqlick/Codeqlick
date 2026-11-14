---
title: Build notifications
description: Get told when a build fails or succeeds. Send notifications by email, Slack, Discord or a signed webhook of your own.
group: hosting
order: 10
---

A project can tell people when its builds end, so nobody has to watch the console.

## Channels

Add up to 5 channels per project in its **Notifications** tab. Team owners and admins manage them. A channel has a name, a kind and the events it wants.

| Kind        | Where it goes                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| **Email**   | Members of your team (1 to 10), each in their own language.                                             |
| **Slack**   | An [incoming webhook](https://api.slack.com/messaging/webhooks) (`https://hooks.slack.com/services/…`). |
| **Discord** | A channel webhook (`https://discord.com/api/webhooks/…`).                                               |
| **Webhook** | Any `https` URL of yours, on port 443.                                                                  |

Slack, Discord and webhook URLs contain a secret, so Codeqlick stores them encrypted and shows only the host and the last 4 characters. To change one, enter it again.

## Events

- **Build failed:** on by default. A build refused because the month's builds ran out counts as failed.
- **Build succeeded:** off by default. The message includes the deployment's address.
- **Previews:** off by default, which means only production builds notify. Turn it on to include previews.

Canceled builds notify nobody.

## What a message says

```text
❌ web · build #12 failed on main (a1b2c3d Fix header): The build exited with code 1
✅ web · main published: https://web.codeqlick.app
```

Each one links to the build. Slack and Discord messages use the language chosen when the channel was created (`en` or `es`).

## Webhook payload

A webhook channel receives a `POST` with JSON:

```json
{
  "event": "build.failed",
  "project": { "slug": "web", "name": "Web" },
  "build": {
    "number": 12,
    "target": "production",
    "branch": "main",
    "commit": "a1b2c3d4e5f6…",
    "commitMessage": "Fix header",
    "author": "Ana",
    "pullRequest": null,
    "status": "FAILED",
    "error": "The build exited with code 1",
    "durationMs": 48213,
    "url": "https://cloud.codeqlick.com/…"
  },
  "deployment": null,
  "sentAt": "2026-11-14T10:15:00.000Z"
}
```

`deployment` is `{ "url": "…" }` when a build succeeded. The request has two headers: `X-Codeqlick-Event` with the event name, and `X-Codeqlick-Signature` with `sha256=` and the HMAC-SHA256 of the raw body, using the channel's secret. Codeqlick shows the secret (`cqn_…`) once, when you create the channel.

Check the signature before you trust a request:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function isValid(rawBody, header, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Your endpoint must answer with a `2xx` within 10 seconds. Redirects are not followed, and only public addresses are called.

## Delivery

Each channel remembers its last delivery, and the console shows it. Ten failed deliveries in a row switch the channel off and email the team's admins once. **Send a test** sends a sample event and shows the result.
