---
title: Quickstart
description: Sign in with the Codeqlick CLI, link a folder to a project and deploy your built site to a public address in a few minutes.
group: start
order: 2
---

This page takes you from nothing to a live site. You need Node 20 or later and a built site: a folder with an `index.html` at its root, such as the output of `astro build`, `vite build` or plain HTML files.

## 1. Sign in

Create your team in the [console](https://cloud.codeqlick.com) if you don't have one, then sign in from your terminal:

```sh
npx @codeqlick/cli login
```

The command opens your browser with a short code. Check that the code matches the one in your terminal, then approve. The CLI saves a token that lasts 90 days.

If you use the CLI often, install it once and type `codeqlick` instead of `npx @codeqlick/cli`:

```sh
npm install --global @codeqlick/cli
```

## 2. Link the folder to a project

In your project's folder, run:

```sh
codeqlick init
```

It asks for your team and a project (you can create one) and writes a `codeqlick.json` file. Commit that file: it lets teammates and CI deploy to the same project.

## 3. Build and deploy

```sh
npm run build
codeqlick deploy dist --prod
```

`dist` is the folder to upload. The `--prod` flag publishes it. Without the flag, the deployment is only a preview. The command prints the deployment's address and, with `--prod`, the project's address:

```text
✓ Deployment a1b2c3d4: https://web--a1b2c3d4.codeqlick.app
✓ Published: https://web.codeqlick.app
```

Your site is live at `https://<project>.codeqlick.app` with HTTPS.

## 4. Change something and go back

Deploy again after every change. If a deployment is wrong, publish the one before it:

```sh
codeqlick rollback
```

The switch is instant and atomic: visitors never see half a site.

## Next steps

- Read how [static hosting](/en/static-hosting/) serves your files and which limits apply.
- Serve the site on [your own domain](/en/custom-domains/).
- Let Codeqlick build your site on every push with [builds from Git](/en/builds-from-git/).
- Deploy from CI with an [API token](/en/api-tokens/).
