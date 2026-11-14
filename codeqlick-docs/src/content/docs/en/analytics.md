---
title: Web analytics
description: Count visits to your site without cookies or third parties. Add one script, then read the report in the console, the CLI or the API.
group: services
order: 14
---

Codeqlick Cloud counts the visits to your project without cookies, without local storage and without sending your visitors to anyone else. The report is in the console, the CLI and the API.

## Turn it on

Analytics is off by default. A project's admins switch it on in the **Analytics** tab. While it is off, events for the project are dropped.

Add this script to your pages:

```html
<script defer src="https://api.codeqlick.com/v1/cloud/analytics/script.js"></script>
```

The script is under 1 KB. It sends a page view when the page loads and on every navigation of a single-page app. It sends nothing over `http:`, from `localhost`, or when the visitor's browser asks for "Do Not Track".

If your site has a Content-Security-Policy, allow `https://api.codeqlick.com` in `script-src` and `connect-src`.

## Custom events

Count anything else with `window.codeqlick.track`:

```js
document.querySelector('#signup').addEventListener('click', () => {
  window.codeqlick?.track('signup_click');
});
```

An event name has up to 40 characters: letters, digits, `_`, `-`, `.` and `:`.

## What is kept

For each event Codeqlick keeps the event name, the page's path (no query string, no fragment), the referrer's host when it is another site, the campaign (`utm_source` or `ref`), the browser, the operating system and the kind of device (mobile, tablet or desktop). It also keeps a visitor ID: a hash of a secret that changes every day, the project, the IP address and the browser's user agent.

Because that secret is deleted the next day, the IDs can't be recomputed or followed from one day to the next. A person is counted once a day. No IP address, no cookie and no country are kept, so you don't need a cookie banner for it.

Events are kept for 365 days. Visits from bots are not counted. Events are accepted only for pages on your project's addresses and verified domains.

## Read the report

With the CLI, from the project's folder:

```sh
codeqlick analytics                  # the last 7 days
codeqlick analytics --period 30d     # 24h, 7d, 30d, 90d or 365d
codeqlick analytics --json
```

With the API:

```sh
curl "https://api.codeqlick.com/v1/cloud/projects/<project-id>/analytics?period=30d" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

The report has the totals (visitors and page views), a series by hour for `24h` and by day for the other periods, and the top 10 pages, referrers, browsers, operating systems, devices and custom events.

## Free plan

50,000 events a month per team (PRO: 1,000,000). Over it, events are dropped and your team's owners get one email that month.

## Privacy

You decide to measure your site, so you are the controller of the data. Codeqlick processes the events for you, as the Cloud terms say.
