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

## What it doesn't cover

Protection applies to the files of your site. These keep working as before:

- [forms](/en/forms/), [analytics](/en/analytics/) and the public reads of the [key-value store](/en/key-value-store/);
- status pages.

A monitor or a [website check](/en/website-check/) of a protected address sees the password page, as any visitor would.

Visitors' IP addresses are not kept for this feature. The cookie holds no personal data and is set only after the password is entered, so it needs no consent banner.
