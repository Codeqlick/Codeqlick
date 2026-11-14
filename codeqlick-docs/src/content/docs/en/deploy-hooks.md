---
title: Deploy hooks
description: Rebuild a branch of your project by calling a secret URL, so a headless CMS or any webhook can publish new content without a commit.
group: hosting
order: 9
draft: true
---

A deploy hook is a secret URL. When something calls it, Codeqlick builds the latest commit of one branch. Use it to rebuild your site when content changes in a headless CMS, or from any service that can call a webhook.

Hooks need a project connected to a repository with [builds from Git](/en/builds-from-git/).

## Create a hook

```sh
codeqlick hooks add cms-publish --branch main
```

The command prints the hook's URL **once**:

```text
https://api.codeqlick.com/v1/cloud/hooks/cqd_…
```

Paste it into your CMS's webhook settings. Codeqlick stores only a hash of the token, so it can't show the URL again. If you lose it, delete the hook and make a new one. You can also create hooks in the **Deploy hooks** card of the project's **Git** tab.

A hook has a name (unique in the project) and a branch. Without `--branch` it uses the production branch. A project has up to 5 hooks. Project admins create and delete them. A hook can't be edited: make a new one and delete the old one.

```sh
codeqlick hooks               # list the project's hooks
codeqlick hooks rm cms-publish
```

## Call it

Send a `POST`. The body is ignored, so whatever your CMS sends doesn't matter.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/hooks/cqd_…"
```

The answer is `202` with the queued build:

```json
{ "build": { "number": 12, "status": "QUEUED", "url": "https://cloud.codeqlick.com/…" } }
```

The build is a **production** build when the hook's branch is the production branch, and a **preview** build otherwise. It counts against your monthly builds like any other build.

If your CMS saves many times in a row, Codeqlick cancels queued builds of the same branch when a newer one arrives, so ten saves build once or twice.

## Errors

| Status         | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `404`          | The hook was deleted, never existed, or the project was deleted.                                  |
| `403`          | The project is suspended.                                                                         |
| `409`          | The project is no longer connected, or the branch no longer exists. The answer gives the reason.  |
| `429`          | The team's builds for the month are used up, or you called too often: 10 calls a minute per hook. |
| `502` or `503` | GitHub failed, or the GitHub app isn't available. Try again later.                                |

## Revoke a hook

Deleting a hook stops its URL at once. Disconnecting the repository or deleting the project deletes its hooks. Anyone who has the URL can start builds, so treat it like a password.

The project's events list in the console shows every call: the hook's name, the status and the build's number.
