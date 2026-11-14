---
title: Website check API
description: Run Codeqlick's website check from the CLI, the HTTP API or a GitHub Actions step, and fail a pull request when the score drops below your minimum.
group: services
order: 13
---

The website check tests a public page for speed, mobile use, Google visibility and security, and gives it a score from 0 to 100 with advice for each problem. The same check that runs on the Codeqlick website is available to your team as a developer tool.

## From the CLI

```sh
codeqlick audit https://web.codeqlick.app
```

It prints the score, the category scores and each problem that needs attention. These flags are useful in scripts:

| Flag                     | What it does                                                |
| ------------------------ | ----------------------------------------------------------- |
| `--min-score <n>`        | Exit with code `1` when the score is below `n` (0 to 100).  |
| `--fail-on <fail\|warn>` | Exit with code `1` when any check has that result or worse. |
| `--json`                 | Print the whole report as JSON.                             |

## In GitHub Actions

Deploy a preview and check it before you publish. The step fails, and so does the pull request, when the score is under 80:

```yaml
name: Preview and check
on: pull_request

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci && npm run build
      - run: |
          url=$(npx @codeqlick/cli deploy dist --url-only)
          npx @codeqlick/cli audit "$url" --min-score 80
        env:
          CODEQLICK_TOKEN: ${{ secrets.CODEQLICK_TOKEN }}
```

`deploy --url-only` prints only the new deployment's address. Make the token in the console and save it as the repository secret `CODEQLICK_TOKEN`: see [API tokens](/en/api-tokens/). The folder needs a `codeqlick.json`, or pass `--team` and `--project`.

## With the API

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/audits" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://web.codeqlick.app", "teamSlug": "acme", "locale": "en" }'
```

The answer arrives when the check ends, within 60 seconds (`504` otherwise):

```json
{
  "id": "…",
  "url": "https://web.codeqlick.app",
  "finalUrl": "https://web.codeqlick.app/",
  "score": 92,
  "categories": [
    {
      "key": "security",
      "name": "Security",
      "score": 85,
      "checks": [{ "id": "…", "status": "warn", "title": "…", "advice": "…" }]
    }
  ],
  "createdAt": "2026-11-14T10:15:00.000Z"
}
```

A URL that can't be opened answers `422` with the reason. Reports are kept for 30 days: list them with `GET /v1/cloud/teams/<team>/audits` and read one with `GET /v1/cloud/audits/<id>`. The console's **Website check** page runs a check and shows the recent ones.

## Limits

20 checks an hour per team on the free plan (PRO: 200). The check follows the same safe-fetching rules as monitors: it refuses private and reserved addresses.
