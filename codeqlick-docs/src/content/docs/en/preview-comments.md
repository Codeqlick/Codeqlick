---
title: Preview comments
description: Leave comments pinned to a place on a deployment's preview, discuss them in threads, mention teammates and follow everything from the inbox.
group: hosting
order: 11
---

Your team can comment on a deployment's preview, pinned to a page and a spot on it. Each pin starts a thread. The project's **Comments** tab gathers every thread in one inbox.

Nothing is added to your files or to the pages your visitors get. Comments open in a Codeqlick page on the preview's own address, and only for team members who opened it from the console.

## Where it works

Comments work only on deployment addresses, such as `https://web--1a2b3c4d.codeqlick.app`. They never work on:

- the production address (`https://web.codeqlick.app`),
- custom domains,
- branch addresses. A branch address moves to a new deployment with every push, so its pins would move under you.

On those addresses every comments page answers `404`.

## Open a preview for comments

1. In the project's **Deployments** tab, press **Comment** on a deployment.
2. The preview opens in a new tab with a small toolbar on top.
3. Turn on comment mode and click anywhere on the page.

You can also open a thread from the **Comments** tab with **Open on the preview**.

You must be signed in to the console. An [API token](/en/api-tokens/) can't open the comments page.

If the previews ask for a password, the console lets you in without typing it.

## Pins and threads

In comment mode, a click opens a box at that point. Write your comment and send it. The pin keeps its place as you scroll, because it is stored as a position on the page, not on the screen. Codeqlick also remembers the element you clicked, so it can scroll to it and outline it.

Each pin is a thread: the first comment plus its replies. The toolbar shows the pins of the page you are on, and you can browse the preview as usual to comment on other pages. It also shows how many threads are open.

- **Resolve** a thread when it is done. Any member can resolve it or **Reopen** it.
- Resolved pins are hidden. Turn on **Show resolved** to see them again.
- You can delete your own comments. Team admins can delete any comment. Deleting a thread's last comment deletes the thread.

Comments are plain text. They are never shown as HTML.

## Mentions

Type `@` in a comment box to pick a member of your team. Each person you mention gets one email for that comment, in their language, with the comment, the page and a link to the inbox. You can mention up to 10 people per comment. You never get an email for mentioning yourself.

## The inbox

The project's **Comments** tab lists threads with the newest activity first. The tab shows the number of open threads.

- Filter by **Open**, **Resolved** or **All**.
- Each thread shows its deployment, its page and whether it was left on a desktop or mobile width.
- Reply with the same `@` picker, resolve, reopen or delete from there.
- **Open on the preview** opens the page with its pin.

When the hourly cleanup deletes an old deployment, its threads stay in the inbox, but their pins can't be opened anymore.

To read the open threads with the API:

```sh
curl "https://api.codeqlick.com/v1/cloud/projects/<project-id>/comments?status=open" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

`status` is `open` (the default), `resolved` or `all`. The answer has up to 200 threads with their comments, and `open`, the number of open threads.

## Sessions last 2 hours

Opening a preview from the console gives you a session for that one deployment that lasts 2 hours. When it expires, the page says so. Open it again from the console with **Comment** or **Open on the preview**.

If you leave the team, your session stops working at once.

## Sites that forbid framing

The comments page shows your preview inside a frame of the same address. If your site sends `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`, the page can't show it and asks you to allow it.

Allow framing by the same origin instead. In `codeqlick.json`:

```json
{
  "headers": [
    {
      "source": "/*",
      "headers": {
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'"
      }
    }
  ]
}
```

Other sites still can't frame your pages.

## Limits

| Limit                      | Value |
| -------------------------- | ----- |
| Characters per comment     | 2,000 |
| Comments per thread        | 100   |
| Threads per project        | 2,000 |
| Mentions per comment       | 10    |
| Comments a minute per user | 30    |

Past a limit, the comment is refused with a clear message. The limits are the same on every plan.
