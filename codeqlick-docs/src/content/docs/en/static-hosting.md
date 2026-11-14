---
title: Static hosting
description: How Codeqlick Cloud serves your built site. Deployments, preview addresses, rollbacks, single-page apps, what is uploaded and the limits of the free plan.
group: hosting
order: 3
---

Codeqlick Cloud serves a built folder of static files: the output of `astro build`, `vite build`, `next export`, or plain HTML. Each upload is a **deployment**.

## Deployments

A deployment is an immutable copy of your folder. It never changes after it is created. Every deployment has its own address:

```text
https://<project>--<id>.codeqlick.app
```

`<id>` is the first 8 characters of the deployment's ID. Deployment addresses stay available for as long as Codeqlick keeps the deployment, and search engines are told not to index them.

Deploy a folder with the CLI:

```sh
codeqlick deploy dist -m "Fix the header"
```

Without `--prod` the deployment is a **preview**: you can open and share it, but visitors of your project's address don't see it. With `--prod` it also becomes the **production** deployment:

```sh
codeqlick deploy dist --prod
```

The production deployment is served at `https://<project>.codeqlick.app` and on the project's [custom domains](/en/custom-domains/).

You can also make a deployment through the API. Send the folder as a `tar.gz`:

```sh
tar -czf bundle.tar.gz -C dist .
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/deployments" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -F "bundle=@bundle.tar.gz" \
  -F "target=production" \
  -F "message=Fix the header"
```

You can add `commit` and `branch` fields too. Both are shown in the console. Find your project's ID with `GET /v1/cloud/teams/<team>/projects`.

## What is uploaded

The CLI uploads everything in the folder except:

- files and folders that start with a dot, except `.well-known/`;
- anything that matches a line of a `.codeqlickignore` file in the folder you deploy. Put one pattern per line; `*` is a wildcard.

```text
*.map
drafts/*
```

A deployment is refused, and nothing is kept, when:

- it has no `index.html` at its root;
- it contains anything other than regular files and folders (no links or devices);
- it has more than 10,000 files, more than 100 MB once unpacked, or more than 50 MB uploaded;
- your team's storage would go over its limit;
- you make more than 30 deployments an hour in the team.

The answer says why: `400` for an invalid folder, `413` for size and `429` for the rate.

## How files are served

- A request for a folder serves its `index.html`.
- `/about` serves `about.html`, so you can link without the extension.
- When a file doesn't exist, Codeqlick serves your `404.html` with status 404, if you have one.
- When you have a `200.html`, it is served instead for every missing path. Single-page apps use this for client-side routing: copy your app's `index.html` to `200.html`.
- Files under `/_astro/`, `/assets/` and `/_next/static/`, and any file with a content hash in its name, are cached for a year. HTML is revalidated on every visit.
- Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Strict-Transport-Security`. HTTP requests are redirected to HTTPS.

A project without a production deployment answers a "nothing here" page. A suspended project answers a "suspended" page.

## Rollbacks and promotion

Production is a pointer to one deployment. To change it, **promote** another deployment:

```sh
codeqlick deployments        # list them, newest first
codeqlick promote a1b2c3d4   # publish this one
codeqlick rollback           # publish the one before the current
```

Switching is atomic, so a rollback takes effect in a second and nobody sees a half-published site.

## Kept deployments

Codeqlick keeps the last 20 deployments of each project plus the production one. Older ones are deleted with their files. You can delete any deployment that is not production by hand, from the console or with `DELETE /v1/cloud/projects/<project-id>/deployments/<deployment-id>`.

Codeqlick doesn't back up your source files. Keep your sources in Git.

## Limits of the free plan

| Limit                          | Free plan            |
| ------------------------------ | -------------------- |
| Projects per team              | 10                   |
| Storage per team               | 1 GB                 |
| Size of a deployment           | 100 MB, 10,000 files |
| Upload size                    | 50 MB                |
| Deployments per hour, per team | 30                   |
| Domains per project            | 5                    |

Traffic is fair use. Each address is limited to 50 requests per second, with bursts of 100, and Codeqlick tells your team before suspending anything for traffic. See [plans and limits](/en/plans-and-limits/) for the full table.
