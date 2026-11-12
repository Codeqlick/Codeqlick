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

Publishing (`npm publish --access public`, from this folder) needs the `@codeqlick` scope on npm.
