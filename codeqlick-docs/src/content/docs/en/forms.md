---
title: Forms
description: Post an HTML form from your static site to Codeqlick Cloud and receive each submission by email and in the console, with spam protection and CSV export.
group: services
order: 11
---

A static site has no server to receive a form. With Codeqlick Cloud, your page posts the form to Codeqlick, which keeps each submission, emails it to your team and shows it in the console.

## Create a form

In the project's **Forms** tab, create a form. Choose a name, whether to email each submission and which team members get the emails (1 to 5 people from your team; you can't type other addresses). Codeqlick gives the form a public key that starts with `cqf_`.

The key is meant to be in your page's HTML. If it is abused, replace it in the console: copies of the old key stop working.

## Post a form

```html
<form method="post" action="https://api.codeqlick.com/v1/cloud/forms/cqf_YOUR_KEY">
  <label>Name <input name="name" required /></label>
  <label>Email <input name="email" type="email" required /></label>
  <label>Message <textarea name="message" required></textarea></label>

  <!-- Honeypot: real visitors never see it, bots fill it -->
  <input name="_gotcha" tabindex="-1" autocomplete="off" style="display:none" />

  <input type="hidden" name="_redirect" value="https://web.codeqlick.app/thanks/" />
  <input type="hidden" name="_subject" value="New message from the website" />
  <button>Send</button>
</form>
```

You can use any field names. Fields that start with `_` are instructions and are not kept as data:

| Field       | What it does                                                                          |
| ----------- | ------------------------------------------------------------------------------------- |
| `_redirect` | Where to send the visitor afterwards. Must be one of your project's addresses.        |
| `_gotcha`   | A honeypot. When it is filled in, the post is answered as a success and kept nowhere. |
| `_subject`  | The subject of the notification email.                                                |

When there is an `email` field with a valid address, it becomes the email's reply-to, so you reply to the visitor directly.

A plain form post gets a redirect (`303`) to `_redirect`, or back to the page it came from, with `?form=ok` or `?form=error` added. When neither is one of your project's addresses, the visitor sees a short "sent" page.

## Post with JavaScript

Send JSON or form data with `fetch`. The answer is JSON:

```js
const response = await fetch('https://api.codeqlick.com/v1/cloud/forms/cqf_YOUR_KEY', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', message: 'Hello' }),
});
const result = await response.json(); // { ok: true } or { ok: false, error: '…' }
```

You can also test with curl:

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/forms/cqf_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Ana", "message": "Hello" }'
```

## Rules

- A post has up to 30 fields. A field name is up to 60 characters, a value up to 5,000, and the whole post up to 20 KB.
- Files are not accepted (`400`).
- A browser post is accepted only from your project's addresses: `https://<project>.codeqlick.app`, its deployment addresses and its verified [custom domains](/en/custom-domains/). Other origins get `403`. Posts without an `Origin` header, such as curl, are accepted.
- Each IP address can post 10 times a minute across forms.
- The free plan allows 3 forms per project and 1,000 submissions a month per team (PRO: 20 and 20,000). Over the limit, posts get `429` and your team's owners get one email that month.

## Submissions

The console lists submissions newest first, with search, one-by-one deletion and a CSV export (UTF-8, one column per field seen). The API offers the same:

```sh
curl "https://api.codeqlick.com/v1/cloud/projects/<project-id>/forms/<form-id>/submissions.csv" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" -o submissions.csv
```

Codeqlick keeps each submission for 180 days, then deletes it. It keeps the fields, the visitor's email when there is one, and the page the post came from (origin and path only). It doesn't keep IP addresses.

## Privacy

You decide what your forms ask, so you are responsible for that data. Codeqlick keeps it for you as your processor, as the Cloud terms say.
