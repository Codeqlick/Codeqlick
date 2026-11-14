---
title: API tokens and CI
description: Create an API token for scripts and CI, send it to the Codeqlick Cloud API, and deploy from GitHub Actions with CODEQLICK_TOKEN.
group: reference
order: 19
---

An API token lets a script or a CI job use Codeqlick Cloud as you, without a browser sign-in.

## Create a token

In the console, open **Tokens** and create one:

- Give it a name you will recognise, such as `github-actions`.
- Choose when it expires: 30, 90 or 365 days, or never.
- Optionally restrict it to one team. It then fails in every other team.

The token starts with `cqk_` and is shown **once**. Copy it then: Codeqlick stores only a hash and the first characters to recognise it. The console shows when and from which IP address each token was last used. You can have up to 20 tokens. Revoking a token deletes it.

## What a token can do

A token acts as you, with your role in each team. It can deploy and manage projects, deployments, domains, environment variables, builds and the services of a project. It can't manage members, invitations, other tokens or teams: those need you to be signed in to the console. A token works only with `/v1/cloud` routes.

When your account is deactivated, your tokens stop working at once.

## Use it

Send the token as a bearer token:

```sh
curl https://api.codeqlick.com/v1/cloud/me \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

The answer lists your account and teams. Find the IDs you need in the console, or in the answers of `GET /v1/cloud/teams/<team>/projects`.

The CLI reads the token from `CODEQLICK_TOKEN`, or you can save one with `codeqlick login --token cqk_…`.

## Deploy from GitHub Actions

Save the token as a repository secret named `CODEQLICK_TOKEN` (Settings, Secrets and variables, Actions). Commit your `codeqlick.json`, or pass `--team` and `--project`.

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci && npm run build
      - run: npx @codeqlick/cli deploy dist --prod -m "$GITHUB_SHA"
        env:
          CODEQLICK_TOKEN: ${{ secrets.CODEQLICK_TOKEN }}
```

If you connect your repository with [builds from Git](/en/builds-from-git/), Codeqlick builds and deploys for you, and you don't need this workflow.

## Keep tokens safe

- Use one token per use, and restrict it to the team it needs.
- Set an expiry for tokens you don't use every day.
- Never commit a token. If one leaks, revoke it in the console.
