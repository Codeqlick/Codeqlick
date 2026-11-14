---
title: Custom domains
description: Serve your Codeqlick Cloud project on your own domain. Add the domain, verify ownership with a TXT record, point it at Codeqlick and get HTTPS automatically.
group: hosting
order: 4
---

A project serves its production deployment on up to 5 domains of your own. Each one is added separately: `example.com` and `www.example.com` are two domains.

## Add a domain

With the CLI, from the project's folder:

```sh
codeqlick domains add docs.example.com
```

Or in the console, in the project's **Domains** tab. Codeqlick prints the DNS records you need to create at your DNS provider.

You can't add a domain that is under `codeqlick.app` or `codeqlick.com`, or one that is already used by another project.

## 1. Verify that you own it

Create a `TXT` record named `_codeqlick.<domain>` with the value Codeqlick shows you:

```text
_codeqlick.docs.example.com.  TXT  "cq-verify=3f9c1a7e…"
```

Nothing is served for a domain until it is verified. That is how Codeqlick makes sure nobody points a domain they don't own at the platform.

## 2. Point it at Codeqlick

- For a subdomain such as `docs.example.com`, create a `CNAME` record to `<project>.codeqlick.app`.
- For a root domain such as `example.com`, create an `A` record to the IP address shown in the console. A root domain can't be a `CNAME`.

```text
docs.example.com.  CNAME  web.codeqlick.app.
example.com.       A      <the IP address shown in the console>
```

When the domain resolves to Codeqlick, a Let's Encrypt certificate is issued and renewed for it automatically. You don't upload anything.

## States

| State      | Meaning                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `PENDING`  | The `TXT` record is not verified yet.                                                                          |
| `VERIFIED` | Ownership is verified, but the domain doesn't point at Codeqlick yet, or doesn't answer over HTTPS yet.        |
| `LIVE`     | The domain serves your production deployment over HTTPS.                                                       |
| `ERROR`    | The domain stopped resolving to Codeqlick. The reason is shown. It comes back on its own when you fix the DNS. |

Codeqlick checks domains that are not `LIVE` every 10 minutes for 7 days, then daily. It checks `LIVE` domains every 6 hours. DNS changes can take a while to reach everyone, so a new domain may need some time.

To check one right now:

```sh
codeqlick domains check docs.example.com
```

## List and remove

```sh
codeqlick domains                       # your domains and their states
codeqlick domains rm docs.example.com   # stop serving it
```

Removing a domain unpublishes it within a minute.

## API

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/domains" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "docs.example.com" }'
```

The answer includes what to add to your DNS. `POST /v1/cloud/projects/<project-id>/domains/<domain-id>/check` checks a domain now (10 a minute).
