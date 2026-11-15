---
title: Password protection
description: Ask visitors for a password before they see a project's preview deployments, or the whole site, so you can show work in progress without making it public.
group: hosting
order: 5
draft: true
---

Password protection asks visitors for a password before they see your site. Use it to show work in progress to a client without making it public. It is available on every plan.

## Modes

| Mode       | What asks for the password                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `off`      | Nothing. This is the default.                                                                            |
| `previews` | Every deployment address, such as `https://web--a1b2c3d4.codeqlick.app`.                                 |
| `all`      | The deployment addresses, plus production: `https://web.codeqlick.app` and the project's custom domains. |

A project has one password, 8 to 128 characters. Team owners and admins change the setting.

## Turn it on

With the CLI, from the project's folder:

```sh
codeqlick protect previews
```

The CLI asks for the password twice, without showing it. In a script, pipe the password in:

```sh
printf '%s' "$SITE_PASSWORD" | codeqlick protect all --days 30
```

Or use the **Password protection** card in the project's **Settings** tab in the console.

To see the current state, or to turn it off:

```sh
codeqlick protect
codeqlick protect off
```

Turning it off deletes the password, so you need to enter one again to turn it on.

## What visitors see

A visitor of a protected address sees a page with the project's name and a password field. After the right password, Codeqlick sets a cookie that lasts 1, 7 or 30 days (7 by default; choose it with `--days`). The cookie works only on the address where it was set, so a visitor of a project protected with `all` enters the password once per address.

Wrong guesses are limited: 5 tries a minute per visitor and project.

## Change the password or the mode

Change the password or switch the mode with the same command. An empty answer keeps the current password, which is how you change only the mode or the days:

```sh
codeqlick protect all
```

Changing the password or the mode signs out every visitor who was let in before. Changing only the number of days doesn't. A change reaches visitors within a minute.

## Team members

When you open a protected address from the console, you are let in without typing the password. The link is valid for one minute and works once.

## Bypass for automation

End-to-end tests in CI, link checkers and `curl` can't type a password or keep a cookie. For them, a project can have one **bypass token**: a separate secret that lets a request through without the password. Changing the password doesn't affect it, and revoking it doesn't sign any visitor out.

Create it from the project's folder (team owners and admins can):

```sh
codeqlick protect bypass
```

The command prints the token once, and only the token, on standard output. Everything else goes to standard error, so you can store it as a secret in one step:

```sh
codeqlick protect bypass | gh secret set CQ_BYPASS
```

You can also use **Generate** in the **Bypass for automation** row of the **Password protection** card. The token starts with `cqb_` and can't be read again: if you lose it, generate a new one. Generating again replaces the old token, which stops working at once (for a request that was cached, within a minute). One project has one token.

Send the token in the `X-Codeqlick-Bypass` header, on every request:

```sh
curl -H "X-Codeqlick-Bypass: $CQ_BYPASS" https://web--a1b2c3d4.codeqlick.app/
```

In Playwright, set it once for the whole run:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'https://web--a1b2c3d4.codeqlick.app',
    extraHTTPHeaders: { 'X-Codeqlick-Bypass': process.env.CQ_BYPASS ?? '' },
  },
});
```

Sending the header with `extraHTTPHeaders` adds it to **every** request the page makes, including those to other origins (CDNs, analytics, third-party scripts), so the token would leak to them. To send it only to your project's host, add it with a route instead:

```ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('https://web--a1b2c3d4.codeqlick.app/**', (route) =>
      route.continue({
        headers: { ...route.request().headers(), 'x-codeqlick-bypass': process.env.CQ_BYPASS ?? '' },
      }),
    );
    await use(context);
  },
});
```

Requests to any other host are not touched. Use the same host for every address of the project that you test (add one route per host).

The token works on every address that asks for the password, for every path and method: the deployments' addresses, and with `all` production and your custom domains. It is a header only: never put it in a URL or a cookie. It skips the password only, so the redirects, rewrites and headers of your `codeqlick.json` still apply. While protection is off it does nothing; turning protection off keeps the token, and it works again when you turn protection on.

To remove it:

```sh
codeqlick protect bypass --revoke
```

`codeqlick protect` shows whether a token is set, its first characters and when it was last used. Every team member sees that; only owners and admins create or revoke it. An API token that is read only can't.

Treat it like a password: keep it in your CI's secrets and don't print it in logs. Wrong tokens are limited per visitor, so nobody can lock your tests out by guessing. [Monitors](/en/monitors-and-status-pages/) and the [website check](/en/website-check/) don't send it, so they still see the password page; a tool that can send custom headers can use it.

## What it doesn't cover

Protection applies to the files of your site. These keep working as before:

- [forms](/en/forms/), [analytics](/en/analytics/) and the public reads of the [key-value store](/en/key-value-store/);
- status pages.

A monitor or a [website check](/en/website-check/) of a protected address sees the password page, as any visitor would.

Visitors' IP addresses are not kept for this feature. The cookie holds no personal data and is set only after the password is entered, so it needs no consent banner.
