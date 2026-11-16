---
title: CLI reference
description: Every command and flag of the codeqlick command line tool, with the environment variables and the exit codes you need in scripts and CI.
group: reference
order: 18
---

The `codeqlick` command deploys sites and manages projects, builds, analytics, the key-value store, databases and buckets. It has no dependencies and needs Node 20 or later.

```sh
npx @codeqlick/cli <command>       # run it without installing
npm install --global @codeqlick/cli  # or install it, then type: codeqlick <command>
```

## Project and team

Most commands act on the project linked in the current folder by `codeqlick.json`. Override it with these options:

| Option             | What it does                                  |
| ------------------ | --------------------------------------------- |
| `--team <slug>`    | The team to use. Also `CODEQLICK_TEAM`.       |
| `--project <slug>` | The project to use. Also `CODEQLICK_PROJECT`. |
| `-h`, `--help`     | Show the help.                                |
| `-v`, `--version`  | Show the version.                             |

## Account

| Command                 | What it does                                           |
| ----------------------- | ------------------------------------------------------ |
| `login`                 | Sign in. It opens your browser and you approve a code. |
| `login --token <cqk_…>` | Save an [API token](/en/api-tokens/) instead.          |
| `logout`                | Forget the saved token.                                |
| `whoami`                | Show your account and teams.                           |

## Projects and deployments

| Command                       | What it does                                                           |
| ----------------------------- | ---------------------------------------------------------------------- |
| `init`                        | Link this folder to a project and write `codeqlick.json`.              |
| `deploy [folder]`             | Upload a built folder as a new deployment.                             |
| `deploy --prod`               | Also publish it as production. Without it the deployment is a preview. |
| `deploy -m, --message <text>` | A message shown in the console.                                        |
| `deploy --url-only`           | Print only the deployment's URL, for scripts.                          |
| `deployments`                 | List the project's deployments, newest first.                          |
| `promote <id>`                | Publish an earlier deployment (its short ID).                          |
| `rollback`                    | Publish the deployment before the current one.                         |
| `open`                        | Open the published site.                                               |

See [static hosting](/en/static-hosting/) for what is uploaded.

## Domains

| Command                  | What it does                                      |
| ------------------------ | ------------------------------------------------- |
| `domains`                | List the project's domains and their states.      |
| `domains add <domain>`   | Add a domain and print the DNS records to create. |
| `domains check <domain>` | Check a domain now.                               |
| `domains rm <domain>`    | Remove a domain.                                  |

See [custom domains](/en/custom-domains/).

## Website check

| Command                        | What it does                                         |
| ------------------------------ | ---------------------------------------------------- |
| `audit <url>`                  | Run the [website check](/en/website-check/).         |
| `audit --min-score <n>`        | Exit with `1` below this score (0 to 100).           |
| `audit --fail-on <fail\|warn>` | Exit with `1` when a check has that result or worse. |
| `audit --json`                 | Print the report as JSON.                            |

## Builds from Git

| Command                                                                                       | What it does                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `git`                                                                                         | Show the connected repository and the build settings.                                  |
| `git connect <owner/repo>`                                                                    | Connect a repository. Install the GitHub app in the console first.                     |
| `git connect … --branch <name>`                                                               | The production branch (the repository's default).                                      |
| `git connect … --root <dir> --install <cmd> --build <cmd> --output <dir> --node <20\|22\|24>` | Build settings.                                                                        |
| `git disconnect`                                                                              | Stop building from Git.                                                                |
| `env`                                                                                         | List [environment variables](/en/environment-variables/) (names only).                 |
| `env add <KEY> [value]`                                                                       | Save one. Without a value it reads standard input, or asks without echo in a terminal. |
| `env add … --production --preview`                                                            | Where it applies. Both when you give neither.                                          |
| `env rm <KEY>`                                                                                | Delete one.                                                                            |
| `builds`                                                                                      | List the latest builds.                                                                |
| `builds start [--branch <name>]`                                                              | Build the branch's latest commit and follow the log.                                   |
| `builds cancel <number>`                                                                      | Cancel a queued or running build.                                                      |
| `logs [number]`                                                                               | A build's log (the latest by default), followed live; `--out <file>` saves it.         |
| `--json`                                                                                      | Print the API's answer, for `git`, `env` and `builds`.                                 |

See [builds from Git](/en/builds-from-git/).

## Analytics and key-value store

| Command                                        | What it does                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `analytics`                                    | Visitors, page views, top pages and sources.                            |
| `analytics --period <24h\|7d\|30d\|90d\|365d>` | The period. Default `7d`.                                               |
| `kv [ls] [prefix]`                             | List keys.                                                              |
| `kv get <key>`                                 | Print a key's value as JSON.                                            |
| `kv set <key> <value>`                         | Save JSON, or text when the value isn't JSON. `-` reads standard input. |
| `kv set … --ttl <seconds>`                     | Expire the key.                                                         |
| `kv rm <key>`                                  | Delete a key.                                                           |
| `kv incr <key> [--by <n>]`                     | Add to a counter atomically. It starts at 0.                            |
| `--json`                                       | Print the API's answer, for `analytics` and `kv`.                       |

See [web analytics](/en/analytics/) and the [key-value store](/en/key-value-store/).

## Databases

The `db` commands need version 0.6 or later.

| Command                  | What it does                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `db [ls]`                | List the project's databases: size against its limit, read-only, the connection string without the password. |
| `db create <name>`       | Create a database and print its full connection URL. It is shown only once.                                  |
| `db url <name>`          | Reset the password and print the new URL once. Apps using the old password stop connecting. Asks first.      |
| `db rm <name>`           | Delete the database and all its data. Asks first.                                                            |
| `db psql <name>`         | Run your local `psql` on the database. `psql` asks for the password.                                         |
| `db psql <name> --reset` | Reset the password first (asks first) and pass it to `psql` through `PGPASSWORD`, never on the command line. |
| `--json`                 | Print the API's answer.                                                                                      |

See [databases](/en/databases/).

## Buckets

The `buckets` commands need version 0.6 or later.

| Command                                       | What it does                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `buckets [ls]`                                | List the buckets: size and objects against the quota, public address, CORS origins, keys.            |
| `buckets create <name>`                       | Create a bucket.                                                                                     |
| `buckets rm <name>`                           | Delete an empty bucket and its keys. Asks first.                                                     |
| `buckets keys <bucket>`                       | List the bucket's access keys.                                                                       |
| `buckets key create <bucket> [--name <name>]` | Make a read-only key (named `cli` by default). Prints the secret once, with the endpoint and region. |
| `buckets key create … --write`                | Make a read-write key instead.                                                                       |
| `buckets key rm <bucket> <key>`               | Delete a key by its ID, access key ID or name. Asks first.                                           |
| `buckets public <bucket> on\|off`             | Make the bucket public or private. `on` asks first and prints the public address.                    |
| `buckets cors <bucket>`                       | Print the bucket's CORS rule.                                                                        |
| `buckets cors <bucket> set <origin...>`       | Replace the rule with these origins.                                                                 |
| `buckets cors … set --methods <list>`         | Allowed methods, comma-separated, such as `GET,HEAD,PUT`. Default `GET,HEAD`.                        |
| `buckets cors … set --headers <list>`         | Allowed request headers, comma-separated. Default `*`.                                               |
| `buckets cors … set --max-age <seconds>`      | How long browsers cache the preflight answer. Default 3600.                                          |
| `buckets cors <bucket> clear`                 | Remove the rule.                                                                                     |
| `--json`                                      | Print the API's answer.                                                                              |

See [object storage](/en/object-storage/).

### Names and confirmations

A `<name>` or `<bucket>` is matched first as an ID, then exactly (case-sensitive) as a name in the project. Databases can share a name: then use the ID the error lists.

Commands that delete data, reset a password or make files public ask `[y/N]` first. Only `y` or `yes` goes on.

| Option        | What it does                                                                               |
| ------------- | ------------------------------------------------------------------------------------------ |
| `--yes`, `-y` | Skip the question. Without a terminal, as in CI, these commands refuse unless you pass it. |

```sh
export CODEQLICK_TOKEN=cqk_…
codeqlick db rm staging --project web --yes
```

## Password protection

| Command                                   | What it does                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `protect`                                 | Show which addresses ask for a password, and whether a bypass token is set.       |
| `protect previews\|all [--days 1\|7\|30]` | Ask for the password on the deployments' addresses, or on every one.              |
| `protect off`                             | Every address is public again.                                                    |
| `protect bypass`                          | Create or replace the bypass token. Only the token goes to standard output.       |
| `protect bypass --revoke`                 | Remove the bypass token.                                                          |
| `--json`                                  | Print the API's answer (`{ token, prefix, createdAt }`, or `{}` with `--revoke`). |

## Monitors

| Command                      | What it does                                                 |
| ---------------------------- | ------------------------------------------------------------ |
| `monitors`                   | List the team's monitors: state, time in it and last check.  |
| `monitors pause <id\|name>`  | Stop checking a monitor, e.g. around planned work.           |
| `monitors resume <id\|name>` | Check it again. Its state is `UNKNOWN` until the next check. |
| `monitors --team <slug>`     | The team (or `CODEQLICK_TEAM`). No linked project needed.    |
| `monitors --json`            | Print the API's answer.                                      |

See [monitors, heartbeats and status pages](/en/monitors-and-status-pages/).

## Environment variables

| Variable                              | What it does                                                    |
| ------------------------------------- | --------------------------------------------------------------- |
| `CODEQLICK_TOKEN`                     | An API token, for CI. It takes precedence over a saved sign-in. |
| `CODEQLICK_TEAM`, `CODEQLICK_PROJECT` | Same as `--team` and `--project`.                               |
| `CODEQLICK_API_URL`                   | The API's address. You almost never need it.                    |

## Files

`codeqlick.json` holds your team, project and the folder to deploy. Commit it. `codeqlick login` saves your token in `~/.config/codeqlick/config.json`, readable only by your user.

## Exit codes

| Code | Meaning                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | The command worked.                                                                                                                                    |
| `1`  | The command failed. Also: a build failed or was canceled (`builds start`, `logs`), or the website check missed `--min-score` or `--fail-on` (`audit`). |
