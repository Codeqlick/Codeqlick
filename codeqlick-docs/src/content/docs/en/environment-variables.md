---
title: Environment variables
description: Give your builds secrets and settings as environment variables. Choose production, previews or both, and manage them in the console or with the CLI.
group: hosting
order: 8
---

Environment variables give a [build from Git](/en/builds-from-git/) the values it needs, such as an API key or a CMS address. They exist only while the build runs. A static site has no runtime, so they never reach your visitors unless your build writes them into the site.

## Rules

- Names match `[A-Z_][A-Z0-9_]*`, up to 64 characters, such as `PUBLIC_API_URL` or `CMS_TOKEN`.
- Values are up to 4 KB.
- A project has up to 50 variables on the free plan (200 on PRO).
- Each variable applies to **production** builds, **preview** builds, or both.
- Values are encrypted and **write-only**. The console and the CLI show names, never values. To change a value, enter it again.
- The build log hides the values.

A new value applies from the next build.

## With the CLI

```sh
codeqlick env                      # names and targets
codeqlick env add CMS_TOKEN        # asks for the value without showing it
codeqlick env add API_URL https://api.example.com --production
codeqlick env rm CMS_TOKEN
```

Without `--production` and `--preview`, a variable applies to both. When you leave out the value, the CLI asks for it without echo in a terminal, or reads standard input, so secrets stay out of your shell history:

```sh
printf '%s' "$CMS_TOKEN" | codeqlick env add CMS_TOKEN --production
```

## With the API

```sh
curl -X PUT "https://api.codeqlick.com/v1/cloud/projects/<project-id>/env" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "key": "CMS_TOKEN", "value": "s3cret", "production": true, "preview": false }'
```

`GET` on the same path lists the names. `DELETE ...?key=CMS_TOKEN` removes one. Only project admins can change variables.
