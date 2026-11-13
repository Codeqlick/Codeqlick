# @codeqlick/cli

Deploy static sites to [Codeqlick Cloud](https://cloud.codeqlick.com) from your terminal or CI.

```sh
npx @codeqlick/cli login            # approve it in the browser
npx @codeqlick/cli init             # link this folder to a project (codeqlick.json)
npx @codeqlick/cli deploy dist --prod
```

Every deployment gets its own address (`https://<project>--<id>.codeqlick.app`); `--prod` also
publishes it at `https://<project>.codeqlick.app` and on your domains. `codeqlick rollback` goes
back in a second.

| Command                                     | What it does                                 |
| ------------------------------------------- | -------------------------------------------- |
| `login [--token <cqk_…>]`                   | Sign in through the browser, or save a token |
| `logout` / `whoami`                         | Forget the token / your account and teams    |
| `init`                                      | Link the folder to a project                 |
| `deploy [folder] [--prod] [-m <text>]`      | Upload the folder as a new deployment        |
| `deployments` / `promote <id>` / `rollback` | List, publish an earlier one, go back        |
| `domains [add\|check\|rm <domain>]`         | The project's own domains                    |
| `open`                                      | Open the published site                      |

Builds from Git (connect GitHub once in the console's Git tab):

| Command                                                           | What it does                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `git` / `git connect <owner/repo>` / `git disconnect`             | The repository and build settings                          |
| `env` / `env add <KEY> [value]` / `env rm <KEY>`                  | Variables (without a value: stdin or hidden prompt)        |
| `hooks` / `hooks add <name> [--branch]` / `hooks rm <id or name>` | Deploy hooks: a secret URL a CMS calls to rebuild a branch |
| `builds` / `builds start [--branch]` / `builds cancel <n>`        | List, build now and follow, cancel                         |
| `logs [number]`                                                   | A build's log, followed while it runs                      |

`hooks add` prints the hook's URL once: paste it in the CMS's webhook (a `POST`, no body needed). Builds a hook queued show as `<branch> (hook <name>)` in `builds`.

`builds start` and `logs` exit with 1 when the build fails, so CI can wait on a build.

Analytics and the key-value store:

| Command                                        | What it does                                        |
| ---------------------------------------------- | --------------------------------------------------- |
| `analytics [--period 24h\|7d\|30d\|90d\|365d]` | Visitors, page views, top pages, sources and events |
| `kv [ls] [prefix]`                             | The project's keys                                  |
| `kv get <key>` / `kv rm <key>`                 | Read or delete a key                                |
| `kv set <key> <value> [--ttl <s>]`             | Save JSON (or text); `-` reads standard input       |
| `kv incr <key> [--by <n>]`                     | Add to a counter atomically                         |

`deploy --url-only` prints only the new deployment's URL, to chain it with `audit`:

```yaml
- run: |
    url=$(npx @codeqlick/cli deploy dist --url-only)
    npx @codeqlick/cli audit "$url" --min-score 80
  env:
    CODEQLICK_TOKEN: ${{ secrets.CODEQLICK_TOKEN }}
```

In CI, set `CODEQLICK_TOKEN` (a token from the console) and keep `codeqlick.json` in the
repository, or pass `--team` and `--project` (`CODEQLICK_TEAM`, `CODEQLICK_PROJECT`).

No dependencies; Node 20 or later. Full docs: https://cloud.codeqlick.com/en/docs

## Development

```sh
npm ci
npm test            # node --test on the TypeScript sources (Node 24)
npm run build       # dist/, what is published
CODEQLICK_API_URL=http://localhost:4000/v1 node dist/cli.js whoami
```

Releasing: bump `version` in `package.json` and `src/version.ts` (a test checks they match), merge, then push a tag `cli-v<version>` (`git tag cli-v0.1.1 && git push origin
cli-v0.1.1`). The workflow `CLI publish` publishes it with npm's Trusted Publishing (no token or
2FA code; configured on npmjs.com for `.github/workflows/cli-publish.yml`).
