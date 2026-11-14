---
title: Builds from Git
description: Connect a GitHub repository to a Codeqlick Cloud project. Every push is built and published, and pull requests get their own preview address.
group: hosting
order: 7
---

Connect a GitHub repository to a project and Codeqlick builds and deploys it on every push. Pull requests get preview addresses and a comment with the link.

## Connect GitHub

1. Open the project's **Git** tab in the [console](https://cloud.codeqlick.com) and press **Connect GitHub**. Only team owners and admins can do this.
2. Install the _Codeqlick Cloud_ GitHub app on the repositories you choose. Installing happens in your browser.
3. Choose the repository and the **production branch**.

The app can read your code and write commit statuses and pull request comments. It can't change your code.

You can then manage the connection from the CLI:

```sh
codeqlick git                                 # the repository and the build settings
codeqlick git connect acme/web --branch main  # connect a repository the app can see
codeqlick git disconnect                      # stop building from Git
```

## What triggers a build

| Event                                                                         | Result                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Push to the production branch                                                 | A **production** build, published when it succeeds. |
| Push to another branch                                                        | A **preview** build (you can turn this off).        |
| Pull request opened, reopened or updated from a branch of the same repository | A preview build with its own address.               |

Pull requests from forks are never built, because their code is a stranger's. Branch deletions, tags and commits whose message contains `[skip cloud]` are ignored. A newer build for the same branch cancels the queued ones before it.

GitHub shows a commit status named `Codeqlick Cloud` on each commit, pending, then success with the deployment's address or failure with a link to the build. A pull request gets one comment, updated with each build, with the preview address and the state.

## Build settings

All settings are optional. Defaults are shown when there is one:

| Setting                          | Default               | CLI flag    |
| -------------------------------- | --------------------- | ----------- |
| Root folder                      | the repository's root | `--root`    |
| Install command                  | `npm ci`              | `--install` |
| Build command                    | `npm run build`       | `--build`   |
| Output folder                    | `dist`                | `--output`  |
| Node version                     | one of 20, 22 or 24   | `--node`    |
| Build other branches as previews | on                    |             |
| Build pull requests              | on                    |             |

```sh
codeqlick git connect acme/web --branch main --root site --build "npm run build:prod" --output out --node 24
```

Set [environment variables](/en/environment-variables/) for secrets that your build needs.

## Builds

A build moves from `QUEUED` to `RUNNING` and ends as `SUCCEEDED`, `FAILED` or `CANCELED`. Your build runs in a fresh, isolated container with internet access and no access to anything else. It has 2 CPUs and 2 GB of memory and can take at most 15 minutes on the free plan. The team runs one build at a time.

A successful build deploys its output folder exactly like `codeqlick deploy`, so the same [limits](/en/static-hosting/) apply. Builds are kept for 90 days and their logs for 30. A log is at most 1 MB: when it is longer, its end is kept.

```sh
codeqlick builds                         # the latest builds
codeqlick builds start --branch main     # build the branch's latest commit and follow it
codeqlick logs                           # the latest build's log, followed while it runs
codeqlick builds cancel 12               # cancel a queued or running build
```

`builds start` and `logs` exit with code `1` when the build fails or is canceled, so a CI job can wait for a build.

## Free plan

200 builds a month per team (counted per calendar month in Madrid time), 15 minutes per build. When the month's builds run out, new builds are refused with a note in the console and a failed commit status. See [plans and limits](/en/plans-and-limits/).

To get told about failed builds, set up [build notifications](/en/build-notifications/).
