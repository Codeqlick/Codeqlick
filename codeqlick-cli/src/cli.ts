#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import {
  Api,
  ApiError,
  type AnalyticsPeriod,
  type AnalyticsRow,
  type Build,
  type BuildStatus,
  type DeployHook,
  type Deployment,
  type GitSettings,
  type Project,
} from './api.ts';
import {
  DEFAULT_API,
  configPath,
  forgetConfig,
  readConfig,
  readProjectFile,
  saveConfig,
  writeProjectFile,
  PROJECT_FILE,
} from './config.ts';
import { collect, pack } from './pack.ts';
import { VERSION } from './version.ts';

const run = promisify(execFile);
const tty = process.stdout.isTTY;
const paint = (code: number) => (text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint(1);
const dim = paint(2);
const green = paint(32);
const pink = paint(35);

class UsageError extends Error {}

const HELP = `${bold('codeqlick')} ${VERSION} — deploy static sites to Codeqlick Cloud

Usage: codeqlick <command> [options]

Commands:
  login [--token <cqk_…>]   Sign in (approve it in the browser), or save a token
  logout                    Forget the saved token
  whoami                    Your account and teams
  init                      Link this folder to a project (writes ${PROJECT_FILE})
  deploy [folder]           Upload a built folder as a new deployment
      --prod                  publish it (otherwise it's a preview)
      -m, --message <text>    shown in the console
      --url-only              print only the deployment's URL (for scripts)
  deployments               The project's deployments, newest first
  promote <id>              Publish an earlier deployment (its short id)
  rollback                  Publish the deployment before the current one
  domains [add|check|rm <domain>]   The project's own domains
  audit <url>               Run the website check (speed, mobile, Google, security)
      --min-score <n>         exit 1 below this score (0-100)
      --fail-on <fail|warn>   exit 1 when a check has that result or worse
      --json                  print the report as JSON
  open                      Open the published site

Builds from Git:
  git                       The connected repository and build settings
  git connect <owner/repo>  Connect a repository (install the GitHub app in the console first)
      --branch <name>         production branch (the repository's default)
      --root <dir> --install <cmd> --build <cmd> --output <dir> --node <20|22|24>
  git disconnect            Stop building from Git
  env                       Environment variables (names only: values can't be read back)
  env add <KEY> [value]     Save one (no value: read from stdin, or asked without echo)
      --production --preview  where it applies (both when neither is given)
  env rm <KEY>              Delete one
  hooks                     Deploy hooks: secret URLs a CMS calls to rebuild a branch
  hooks add <name> [--branch <name>]   Make one (the production branch by default); its URL is shown once
  hooks rm <id or name>     Delete one: its URL stops working at once
  builds                    The latest builds
  builds start [--branch <name>]   Build the branch's latest commit and follow the log
  builds cancel <number>    Cancel a queued or running build
  logs [number]             A build's log (the latest by default), followed while it runs
      --json                  (git, env, hooks, builds) print the API's answer

Analytics and key-value store:
  analytics                 Visitors, page views, top pages and sources
      --period <24h|7d|30d|90d|365d>   (7d by default)
  kv [ls] [prefix]          The project's keys
  kv get <key>              A key's value (JSON)
  kv set <key> <value>      Save a value: JSON, or text when it isn't ("-" reads stdin)
      --ttl <seconds>         expire it
  kv rm <key>               Delete a key
  kv incr <key> [--by <n>]  Add to a counter atomically (starts at 0)
      --json                  (analytics, kv) print the API's answer

Options:
  --team <slug>  --project <slug>   Override ${PROJECT_FILE} (or CODEQLICK_TEAM, CODEQLICK_PROJECT)
  -h, --help     -v, --version

Environment: CODEQLICK_TOKEN (CI), CODEQLICK_API_URL. Docs: https://cloud.codeqlick.com/en/docs`;

interface Options {
  team?: string;
  project?: string;
  prod?: boolean;
  message?: string;
  token?: string;
  'url-only'?: boolean;
  'min-score'?: string;
  'fail-on'?: string;
  json?: boolean;
  branch?: string;
  root?: string;
  install?: string;
  build?: string;
  output?: string;
  node?: string;
  production?: boolean;
  preview?: boolean;
  period?: string;
  ttl?: string;
  by?: string;
}

async function context() {
  const stored = await readConfig();
  const apiUrl = (process.env.CODEQLICK_API_URL || stored.apiUrl || DEFAULT_API).replace(
    /\/+$/,
    '',
  );
  const token = process.env.CODEQLICK_TOKEN || stored.token;
  return { apiUrl, token, api: new Api(apiUrl, token) };
}

async function signedIn() {
  const ctx = await context();
  if (!ctx.token)
    throw new UsageError('Not signed in: run `codeqlick login` (or set CODEQLICK_TOKEN).');
  return ctx;
}

/** The project to act on: flags, then the environment, then codeqlick.json. */
async function target(api: Api, options: Options): Promise<Project> {
  const file = await readProjectFile();
  const team = options.team ?? process.env.CODEQLICK_TEAM ?? file.team;
  const slug = options.project ?? process.env.CODEQLICK_PROJECT ?? file.project;
  if (!team || !slug) {
    throw new UsageError(`No project: run \`codeqlick init\`, or pass --team and --project.`);
  }
  const project = (await api.projects(team)).find((p) => p.slug === slug);
  if (!project) throw new UsageError(`There is no project "${slug}" in the team "${team}".`);
  return project;
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // No browser here: the URL is printed.
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function ask(question: string, fallback = ''): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(`${question}${fallback ? dim(` (${fallback})`) : ''}: `)
    ).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

// ── Commands ──────────────────────────────────────────────────────────────────────────────────

async function login(options: Options): Promise<void> {
  const { apiUrl } = await context();
  if (options.token) {
    const me = await new Api(apiUrl, options.token).me();
    await saveConfig({ ...(await readConfig()), token: options.token });
    console.log(`${green('✓')} Signed in as ${bold(me.user.email)} with a token.`);
    return;
  }
  const api = new Api(apiUrl);
  const machine =
    hostname()
      .replace(/[^\p{L}\p{N} ._@()-]/gu, '')
      .slice(0, 60) || 'terminal';
  const locale = (process.env.LANG ?? '').startsWith('es') ? 'es' : 'en';
  const start = await api.startDevice(machine, locale);
  console.log(`Your code: ${bold(pink(start.userCode))}`);
  console.log(`Approve it at ${start.verificationUriComplete}`);
  openBrowser(start.verificationUriComplete);
  const deadline = Date.now() + start.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(start.interval * 1000);
    let result;
    try {
      result = await api.pollDevice(start.deviceCode);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) continue;
      throw error;
    }
    if (result.status === 'approved') {
      await saveConfig({ ...(await readConfig()), token: result.token });
      console.log(
        `${green('✓')} Signed in as ${bold(result.user.email)}. Token saved in ${dim(configPath())}`,
      );
      return;
    }
    if (result.status === 'denied') throw new UsageError('The sign-in was denied.');
    if (result.status === 'expired') break;
  }
  throw new UsageError('The code expired: run `codeqlick login` again.');
}

async function logout(): Promise<void> {
  await forgetConfig();
  console.log(
    `${green('✓')} Signed out (the token is still valid until you revoke it in the console).`,
  );
}

async function whoami(): Promise<void> {
  const { api } = await signedIn();
  const me = await api.me();
  console.log(
    `${bold(me.user.name)} <${me.user.email}>${me.token ? dim(` · token "${me.token.name}"`) : ''}`,
  );
  for (const team of me.teams)
    console.log(`  ${team.slug}  ${dim(`${team.name} · ${team.role.toLowerCase()}`)}`);
  if (me.teams.length === 0)
    console.log(dim('  No teams yet: create one at https://cloud.codeqlick.com'));
}

async function init(): Promise<void> {
  const { api } = await signedIn();
  const me = await api.me();
  if (me.teams.length === 0)
    throw new UsageError('Create a team first at https://cloud.codeqlick.com');
  const file = await readProjectFile();
  me.teams.forEach((team, index) => console.log(`  ${index + 1}. ${team.slug} ${dim(team.name)}`));
  const pick = await ask('Team', file.team ?? me.teams[0]?.slug);
  const team = me.teams.find((t, index) => t.slug === pick || String(index + 1) === pick);
  if (!team) throw new UsageError(`Unknown team "${pick}".`);
  const projects = await api.projects(team.slug);
  projects.forEach((project, index) =>
    console.log(`  ${index + 1}. ${project.slug} ${dim(project.url)}`),
  );
  console.log(`  n. ${dim('a new project')}`);
  const choice = await ask('Project', file.project ?? (projects.length ? '1' : 'n'));
  let project = projects.find((p, index) => p.slug === choice || String(index + 1) === choice);
  if (!project) {
    const name = await ask('Name of the new project', choice === 'n' ? '' : choice);
    if (!name) throw new UsageError('A project needs a name.');
    const slug = await ask('Address', slugify(name));
    project = await api.createProject(team.slug, name, slug);
    console.log(`${green('✓')} Created ${project.url}`);
  }
  const dir = await ask('Folder to deploy', file.dir ?? 'dist');
  await writeProjectFile({ team: team.slug, project: project.slug, dir });
  console.log(
    `${green('✓')} Linked to ${bold(project.slug)}. Saved in ${PROJECT_FILE}: commit it.`,
  );
}

/** The commit and branch, from GitHub Actions or git, when there are any. */
async function gitInfo(): Promise<{ commit?: string; branch?: string }> {
  if (process.env.GITHUB_SHA) {
    return {
      commit: process.env.GITHUB_SHA,
      branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
    };
  }
  try {
    const commit = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim();
    const branch = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    return { commit, branch: branch === 'HEAD' ? undefined : branch };
  } catch {
    return {};
  }
}

async function deploy(folder: string | undefined, options: Options): Promise<void> {
  const { api } = await signedIn();
  const file = await readProjectFile();
  const root = resolve(folder ?? file.dir ?? 'dist');
  if (!(await stat(root).catch(() => null))?.isDirectory()) {
    throw new UsageError(`${root} isn't a folder: build your site first, or pass the folder.`);
  }
  const project = await target(api, options);
  const files = await collect(root);
  if (!files.some((f) => f.path === 'index.html')) {
    throw new UsageError(`There's no index.html in ${root}.`);
  }
  const work = await mkdtemp(join(tmpdir(), 'codeqlick-'));
  try {
    const bundle = join(work, 'site.tar.gz');
    const size = await pack(files, bundle);
    const total = files.reduce((sum, f) => sum + f.size, 0);
    const quiet = options['url-only'] === true;
    if (!quiet) {
      console.log(
        `Uploading ${files.length} files (${bytes(total)}, ${bytes(size)} compressed) to ${bold(project.slug)}…`,
      );
    }
    const { commit, branch } = await gitInfo();
    const deployment = await api.deploy(project.id, bundle, {
      target: options.prod ? 'production' : 'preview',
      message: options.message,
      commit: commit && /^[0-9a-f]{4,40}$/i.test(commit) ? commit : undefined,
      branch,
    });
    if (quiet) {
      console.log(deployment.url);
      return;
    }
    console.log(`${green('✓')} Deployment ${bold(deployment.shortId)}: ${deployment.url}`);
    if (deployment.isProduction) console.log(`${green('✓')} Published: ${bold(project.url)}`);
    else console.log(dim(`  A preview. Publish it with: codeqlick promote ${deployment.shortId}`));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function allDeployments(api: Api, project: string): Promise<Deployment[]> {
  return (await api.deployments(project)).items;
}

async function deployments(options: Options): Promise<void> {
  const { api } = await signedIn();
  const project = await target(api, options);
  const list = await allDeployments(api, project.id);
  if (list.length === 0) console.log(dim('No deployments yet.'));
  for (const d of list) {
    const tag = d.isProduction ? green('published') : dim('preview  ');
    const when = new Date(d.createdAt).toLocaleString();
    console.log(`${bold(d.shortId)}  ${tag}  ${when}  ${d.message ?? ''}`.trimEnd());
  }
}

async function promote(id: string | undefined, options: Options): Promise<void> {
  if (!id)
    throw new UsageError(
      'Which deployment? `codeqlick promote <id>` (see `codeqlick deployments`).',
    );
  const { api } = await signedIn();
  const project = await target(api, options);
  const found = (await allDeployments(api, project.id)).find(
    (d) => d.shortId === id || d.id === id,
  );
  if (!found) throw new UsageError(`No deployment "${id}" among the last 50.`);
  await api.promote(project.id, found.id);
  console.log(`${green('✓')} ${bold(found.shortId)} is published: ${project.url}`);
}

async function rollback(options: Options): Promise<void> {
  const { api } = await signedIn();
  const project = await target(api, options);
  const list = await allDeployments(api, project.id);
  const current = list.findIndex((d) => d.isProduction);
  const older = current === -1 ? [] : list.slice(current + 1);
  const previous = older.find((d) => d.target === 'production') ?? older[0];
  if (!previous) throw new UsageError('There is no earlier deployment to go back to.');
  await api.promote(project.id, previous.id);
  console.log(`${green('✓')} Back to ${bold(previous.shortId)}: ${project.url}`);
}

async function domains(
  action: string | undefined,
  name: string | undefined,
  options: Options,
): Promise<void> {
  const { api } = await signedIn();
  const project = await target(api, options);
  const show = (d: {
    name: string;
    state: string;
    dns: Array<{ type: string; name: string; value: string; ok: boolean }>;
    lastError: string | null;
  }) => {
    console.log(`${bold(d.name)}  ${d.state === 'LIVE' ? green('live') : d.state.toLowerCase()}`);
    if (d.state !== 'LIVE') {
      for (const r of d.dns)
        console.log(`  ${r.ok ? green('✓') : '·'} ${r.type.padEnd(5)} ${r.name}  ${r.value}`);
      if (d.lastError) console.log(dim(`  ${d.lastError}`));
    }
  };
  if (!action || action === 'ls' || action === 'list') {
    const list = await api.domains(project.id);
    if (list.length === 0) console.log(dim('No domains yet: codeqlick domains add <domain>'));
    list.forEach(show);
    return;
  }
  if (!name) throw new UsageError(`Which domain? codeqlick domains ${action} <domain>`);
  const domain = name.toLowerCase();
  if (action === 'add') {
    show(await api.addDomain(project.id, domain));
    return;
  }
  const found = (await api.domains(project.id)).find((d) => d.name === domain);
  if (!found) throw new UsageError(`${domain} isn't a domain of ${project.slug}.`);
  if (action === 'check') show(await api.checkDomain(project.id, found.id));
  else if (action === 'rm' || action === 'remove') {
    await api.removeDomain(project.id, found.id);
    console.log(`${green('✓')} Removed ${domain}`);
  } else throw new UsageError(`Unknown action "${action}": add, check or rm.`);
}

/** The team a command acts for: the flag, the environment, codeqlick.json, or the only one. */
async function teamOf(api: Api, options: Options): Promise<string> {
  const file = await readProjectFile();
  const team = options.team ?? process.env.CODEQLICK_TEAM ?? file.team;
  if (team) return team;
  const teams = (await api.me()).teams;
  if (teams.length === 1) return teams[0]!.slug;
  throw new UsageError('Which team? Pass --team <slug> (or set CODEQLICK_TEAM).');
}

async function audit(url: string | undefined, options: Options): Promise<number> {
  if (!url || !/^https?:\/\//i.test(url))
    throw new UsageError('Which address? codeqlick audit https://…');
  const minScore = options['min-score'] === undefined ? null : Number(options['min-score']);
  if (minScore !== null && !(Number.isInteger(minScore) && minScore >= 0 && minScore <= 100)) {
    throw new UsageError('--min-score must be a whole number from 0 to 100.');
  }
  const failOn = options['fail-on'];
  if (failOn !== undefined && failOn !== 'fail' && failOn !== 'warn') {
    throw new UsageError('--fail-on must be fail or warn.');
  }
  const { api } = await signedIn();
  const locale = (process.env.LANG ?? '').startsWith('es') ? 'es' : 'en';
  const report = await api.audit(await teamOf(api, options), url, locale);
  const checks = report.categories.flatMap((c) => c.checks);
  const failed =
    (minScore !== null && report.score < minScore) ||
    (failOn === 'fail' && checks.some((c) => c.status === 'fail')) ||
    (failOn === 'warn' && checks.some((c) => c.status !== 'pass'));
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return failed ? 1 : 0;
  }
  const paintScore = report.score >= 90 ? green : report.score >= 50 ? (s: string) => s : pink;
  console.log(`${bold(paintScore(`${report.score}/100`))}  ${report.finalUrl}`);
  console.log(dim(report.categories.map((c) => `${c.name} ${c.score}`).join(' · ')));
  for (const check of checks.filter((c) => c.status !== 'pass')) {
    console.log(`${check.status === 'fail' ? pink('✗') : '!'} ${check.title}`);
    console.log(dim(`  ${check.advice}`));
  }
  if (failed) {
    console.error(
      minScore !== null && report.score < minScore
        ? `The score ${report.score} is under ${minScore}.`
        : `There are checks that ${failOn === 'warn' ? "didn't pass" : 'failed'}.`,
    );
  }
  return failed ? 1 : 0;
}

async function openSite(options: Options): Promise<void> {
  const { api } = await signedIn();
  const project = await target(api, options);
  console.log(project.url);
  openBrowser(project.url);
}

// ── Builds from Git ───────────────────────────────────────────────────────────────────────────

const CONSOLE = 'https://cloud.codeqlick.com';
const ENV_KEY = /^[A-Z_][A-Z0-9_]{0,63}$/;

function showGit(settings: GitSettings): void {
  if (!settings.repo) {
    console.log(dim('Not connected to a repository: codeqlick git connect <owner/repo>'));
    return;
  }
  console.log(`${bold(settings.repo)}  ${dim(`production: ${settings.branch}`)}`);
  const rows: Array<[string, string]> = [
    ['root', settings.rootDir || '.'],
    ['install', settings.installCommand],
    ['build', settings.buildCommand],
    ['output', settings.outputDir],
    ['node', settings.nodeVersion],
    [
      'previews',
      `${settings.buildBranches ? 'branches' : ''}${settings.buildBranches && settings.buildPullRequests ? ', ' : ''}${settings.buildPullRequests ? 'pull requests' : ''}` ||
        'off',
    ],
  ];
  for (const [name, value] of rows) console.log(`  ${dim(name.padEnd(9))}${value}`);
}

async function git(action: string | undefined, name: string | undefined, options: Options) {
  const { api } = await signedIn();
  const project = await target(api, options);
  if (!action || action === 'status') {
    const settings = await api.git(project.id);
    if (options.json) console.log(JSON.stringify(settings, null, 2));
    else showGit(settings);
    return;
  }
  if (action === 'disconnect') {
    await api.disconnectGit(project.id);
    console.log(`${green('✓')} ${bold(project.slug)} no longer builds from Git.`);
    return;
  }
  if (action !== 'connect')
    throw new UsageError(`Unknown action "${action}": connect or disconnect.`);
  if (!name || !/^[\w.-]+\/[\w.-]+$/.test(name)) {
    throw new UsageError('Which repository? codeqlick git connect <owner/repo>');
  }
  const team = project.team.slug;
  const github = await api.teamGithub(team);
  if (!github.configured) throw new UsageError("Builds from Git aren't available yet.");
  const consoleUrl = `${CONSOLE}/en/console/${team}/${project.slug}?tab=git`;
  const installations = github.installations.filter((i) => !i.suspended);
  if (installations.length === 0) {
    throw new UsageError(
      `Install the Codeqlick Cloud app on GitHub first (it needs the browser): ${consoleUrl}`,
    );
  }
  const wanted = name.toLowerCase();
  for (const installation of installations) {
    const repo = (await api.repos(team, installation.id)).find(
      (r) => r.fullName.toLowerCase() === wanted,
    );
    if (!repo) continue;
    const settings = await api.setGit(project.id, {
      installationId: installation.id,
      repoId: repo.id,
      branch: options.branch ?? repo.defaultBranch,
      rootDir: options.root,
      installCommand: options.install,
      buildCommand: options.build,
      outputDir: options.output,
      nodeVersion: options.node,
    });
    console.log(`${green('✓')} ${bold(project.slug)} builds from ${bold(repo.fullName)}.`);
    showGit(settings);
    console.log(
      dim(`  Pushes to ${settings.branch} are published; push now, or: codeqlick builds start`),
    );
    return;
  }
  throw new UsageError(
    `The app can't see ${name}: add it to the app's repositories on GitHub (${consoleUrl}).`,
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

/** Asks for a value without showing what is typed. */
async function askSecret(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write(question);
  (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => undefined;
  try {
    return await rl.question('');
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}

async function env(
  action: string | undefined,
  key: string | undefined,
  value: string | undefined,
  options: Options,
) {
  const { api } = await signedIn();
  const project = await target(api, options);
  const show = (items: Awaited<ReturnType<Api['env']>>) => {
    if (options.json) return console.log(JSON.stringify(items, null, 2));
    if (items.length === 0) console.log(dim('No variables yet: codeqlick env add <KEY>'));
    for (const v of items) {
      const where = [v.production && 'production', v.preview && 'preview'].filter(Boolean);
      console.log(
        `${bold(v.key)}  ${where.join(', ')}  ${dim(new Date(v.updatedAt).toLocaleString())}`,
      );
    }
  };
  if (!action || action === 'ls' || action === 'list') return show(await api.env(project.id));
  if (!key || !ENV_KEY.test(key)) {
    throw new UsageError(
      `Which variable? codeqlick env ${action} <KEY> (upper-case letters, digits, _)`,
    );
  }
  if (action === 'rm' || action === 'remove') {
    await api.deleteEnv(project.id, key);
    console.log(`${green('✓')} Deleted ${key}`);
    return;
  }
  if (action !== 'add' && action !== 'set')
    throw new UsageError(`Unknown action "${action}": add or rm.`);
  const secret =
    value ??
    (process.stdin.isTTY ? await askSecret(`Value of ${key} (hidden): `) : await readStdin());
  if (secret.length > 4096) throw new UsageError('Values are at most 4 KB.');
  const both = !options.production && !options.preview;
  const items = await api.setEnv(project.id, {
    key,
    value: secret,
    production: both || options.production === true,
    preview: both || options.preview === true,
  });
  if (options.json) return show(items);
  console.log(`${green('✓')} Saved ${bold(key)}: it applies from the next build.`);
}

const FINISHED: BuildStatus[] = ['SUCCEEDED', 'FAILED', 'CANCELED'];

function statusText(status: BuildStatus): string {
  const text = {
    QUEUED: 'queued',
    RUNNING: 'building',
    SUCCEEDED: 'ready',
    FAILED: 'failed',
    CANCELED: 'canceled',
  }[status];
  return status === 'SUCCEEDED' ? green(text) : status === 'FAILED' ? pink(text) : dim(text);
}

function duration(ms: number | null): string {
  if (ms === null) return '';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** What a build was for: the pull request, or the branch (with the hook's name for hook builds). */
export function buildSubject(b: Pick<Build, 'pullRequest' | 'branch' | 'trigger' | 'hookName'>) {
  if (b.pullRequest) return `#${b.pullRequest}`;
  return b.trigger === 'hook' ? `${b.branch} (hook ${b.hookName ?? '?'})` : b.branch;
}

function buildLine(b: Build): string {
  const subject = buildSubject(b);
  const message = (b.commitMessage ?? '').split('\n')[0]!.slice(0, 60);
  return [
    bold(`${b.number}`.padStart(4)),
    statusText(b.status).padEnd(tty ? 17 : 8),
    b.target.padEnd(10),
    subject,
    dim(b.commit.slice(0, 7)),
    duration(b.durationMs),
    message,
  ]
    .filter(Boolean)
    .join('  ');
}

/** Prints a build's log until it finishes; the exit code is 1 unless it succeeded. */
async function follow(api: Api, project: Project, number: number): Promise<number> {
  let after = 0;
  let waiting = false;
  for (;;) {
    const build = await api.build(project.id, number, after);
    if (build.log) process.stdout.write(build.log);
    after = build.logOffset;
    if (build.status === 'QUEUED' && !waiting) {
      console.log(dim(`Build ${number} is queued: waiting for a build server…`));
      waiting = true;
    }
    if (FINISHED.includes(build.status)) {
      if (build.log && !build.log.endsWith('\n')) process.stdout.write('\n');
      if (build.status === 'SUCCEEDED') {
        const deployment = (await allDeployments(api, project.id)).find(
          (d) => d.id === build.deploymentId,
        );
        console.log(
          `${green('✓')} Build ${number} is ready (${duration(build.durationMs)})${deployment ? `: ${deployment.url}` : ''}`,
        );
        if (build.target === 'production')
          console.log(`${green('✓')} Published: ${bold(project.url)}`);
        return 0;
      }
      console.error(
        `Build ${number} ${build.status === 'FAILED' ? `failed${build.error ? `: ${build.error}` : ''}` : 'was canceled'}.`,
      );
      return 1;
    }
    await sleep(2_000);
  }
}

async function builds(action: string | undefined, arg: string | undefined, options: Options) {
  const { api } = await signedIn();
  const project = await target(api, options);
  if (!action || action === 'ls' || action === 'list') {
    const list = await api.builds(project.id);
    if (options.json) console.log(JSON.stringify(list, null, 2));
    else if (list.length === 0)
      console.log(dim('No builds yet: push to the repository, or codeqlick builds start'));
    else list.forEach((b) => console.log(buildLine(b)));
    return 0;
  }
  if (action === 'start') {
    const build = await api.startBuild(project.id, options.branch);
    if (options.json) {
      console.log(JSON.stringify(build, null, 2));
      return 0;
    }
    console.log(
      `Build ${bold(String(build.number))}: ${build.branch} ${dim(build.commit.slice(0, 7))} (${build.target})`,
    );
    return follow(api, project, build.number);
  }
  if (action === 'cancel') {
    const number = Number(arg);
    if (!Number.isInteger(number) || number < 1)
      throw new UsageError('Which build? codeqlick builds cancel <number>');
    const build = await api.cancelBuild(project.id, number);
    console.log(`${green('✓')} Build ${build.number} is ${statusText(build.status)}.`);
    return 0;
  }
  throw new UsageError(`Unknown action "${action}": start or cancel.`);
}

/** The hook an argument names: its id, else its name (names are unique in a project). */
export function findHook<T extends { id: string; name: string }>(
  hooks: T[],
  ref: string,
): T | undefined {
  return hooks.find((h) => h.id === ref) ?? hooks.find((h) => h.name === ref);
}

function showHook(h: DeployHook): void {
  const called = h.lastCalledAt ? new Date(h.lastCalledAt).toLocaleString() : 'never called';
  console.log(
    `${bold(h.name)}  ${h.branch}  ${dim(`${h.prefix}…`)}  ${dim(h.createdBy?.name ?? '')}  ${dim(called)}`,
  );
}

async function hooks(action: string | undefined, arg: string | undefined, options: Options) {
  const { api } = await signedIn();
  const project = await target(api, options);
  if (!action || action === 'ls' || action === 'list') {
    const list = await api.hooks(project.id);
    if (options.json) console.log(JSON.stringify(list, null, 2));
    else if (list.length === 0) console.log(dim('No deploy hooks yet: codeqlick hooks add <name>'));
    else list.forEach(showHook);
    return;
  }
  if (action === 'add') {
    if (!arg || arg.length > 60)
      throw new UsageError('What name (1-60)? codeqlick hooks add <name>');
    const hook = await api.createHook(project.id, arg, options.branch);
    if (options.json) return console.log(JSON.stringify(hook, null, 2));
    console.log(`${green('✓')} Deploy hook ${bold(hook.name)} builds ${bold(hook.branch)}.`);
    console.log(`\n  ${hook.url ?? ''}\n`);
    console.log(
      "Paste it in your CMS's webhook (a POST, no body needed). It is shown only now: keep it secret.",
    );
    return;
  }
  if (action === 'rm' || action === 'remove') {
    if (!arg) throw new UsageError('Which hook? codeqlick hooks rm <id or name>');
    const found = findHook(await api.hooks(project.id), arg);
    if (!found) throw new UsageError(`${project.slug} has no deploy hook "${arg}".`);
    await api.deleteHook(project.id, found.id);
    console.log(`${green('✓')} Deleted ${found.name}: its URL no longer works.`);
    return;
  }
  throw new UsageError(`Unknown action "${action}": add or rm.`);
}

async function logs(arg: string | undefined, options: Options): Promise<number> {
  const { api } = await signedIn();
  const project = await target(api, options);
  let number = arg === undefined ? NaN : Number(arg);
  if (arg === undefined) {
    const latest = (await api.builds(project.id, 1))[0];
    if (!latest) throw new UsageError('No builds yet.');
    number = latest.number;
  }
  if (!Number.isInteger(number) || number < 1)
    throw new UsageError('Which build? codeqlick logs <number>');
  return follow(api, project, number);
}

// ── Entry ─────────────────────────────────────────────────────────────────────────────────────

const PERIODS: AnalyticsPeriod[] = ['24h', '7d', '30d', '90d', '365d'];

function table(title: string, rows: AnalyticsRow[], unit: string): void {
  console.log(`\n${bold(title)}`);
  if (rows.length === 0) return console.log(dim('  nothing yet'));
  const width = Math.min(48, Math.max(...rows.map((r) => r.key.length)));
  for (const row of rows) {
    console.log(
      `  ${row.key.slice(0, 48).padEnd(width)}  ${String(row.visitors).padStart(6)} visitors  ${String(row.count).padStart(6)} ${unit}`,
    );
  }
}

async function analytics(options: Options): Promise<void> {
  const period = (options.period ?? '7d') as AnalyticsPeriod;
  if (!PERIODS.includes(period)) throw new UsageError(`--period is one of ${PERIODS.join(', ')}.`);
  const { api } = await signedIn();
  const project = await target(api, options);
  const report = await api.analytics(project.id, period);
  if (options.json) return console.log(JSON.stringify(report, null, 2));
  if (!report.enabled) {
    console.log(
      dim(`Analytics are off for ${project.slug}: switch them on in the console and add`),
    );
    console.log(dim(`  ${report.snippet}`));
  }
  console.log(
    `${bold(project.slug)} · ${period}: ${bold(String(report.totals.visitors))} visitors, ${bold(String(report.totals.pageviews))} page views`,
  );
  table('Pages', report.pages, 'views');
  table('Sources', report.referrers, 'views');
  if (report.events.length > 0) table('Events', report.events, 'times');
}

/** A value typed on the command line: JSON when it parses, otherwise the text itself. */
export function parseValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const KV_KEY = /^[A-Za-z0-9._:-]{1,256}$/;

async function kv(
  action: string | undefined,
  key: string | undefined,
  value: string | undefined,
  options: Options,
): Promise<number> {
  const { api } = await signedIn();
  const project = await target(api, options);
  if (!action || action === 'ls' || action === 'list') {
    const prefix = action ? key : undefined;
    let cursor: string | undefined;
    const items = [];
    let usage: Awaited<ReturnType<Api['kvList']>>['usage'] | undefined;
    do {
      const page = await api.kvList(project.id, prefix, cursor);
      items.push(...page.items);
      usage = page.usage;
      cursor = page.cursor ?? undefined;
    } while (cursor && items.length < 1000);
    if (options.json) return (console.log(JSON.stringify({ items, usage }, null, 2)), 0);
    if (items.length === 0) console.log(dim('No keys yet: codeqlick kv set <key> <value>'));
    for (const item of items) {
      const expires = item.expiresAt
        ? dim(` expires ${new Date(item.expiresAt).toLocaleString()}`)
        : '';
      console.log(`${bold(item.key)}  ${dim(`${item.size} B`)}${expires}`);
    }
    if (usage) console.log(dim(`${usage.keys} of ${usage.maxKeys} keys`));
    return 0;
  }
  if (!key || !KV_KEY.test(key)) {
    throw new UsageError(
      `Which key? codeqlick kv ${action} <key> (letters, digits, ".", "_", "-", ":")`,
    );
  }
  switch (action) {
    case 'get': {
      const entry = await api.kvGet(project.id, key);
      console.log(
        options.json
          ? JSON.stringify(entry, null, 2)
          : typeof entry.value === 'string'
            ? entry.value
            : JSON.stringify(entry.value, null, 2),
      );
      return 0;
    }
    case 'set': {
      if (value === undefined) throw new UsageError('What value? codeqlick kv set <key> <value>');
      const raw = value === '-' ? await readStdin() : value;
      const ttl = options.ttl === undefined ? undefined : Number(options.ttl);
      if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 1)) {
        throw new UsageError('--ttl is a whole number of seconds.');
      }
      const entry = await api.kvSet(project.id, key, parseValue(raw), ttl);
      if (options.json) console.log(JSON.stringify(entry, null, 2));
      else console.log(`${green('✓')} Saved ${bold(key)} (${entry.size} B)`);
      return 0;
    }
    case 'rm':
    case 'remove':
      await api.kvDelete(project.id, key);
      console.log(`${green('✓')} Deleted ${key}`);
      return 0;
    case 'incr': {
      const by = options.by === undefined ? 1 : Number(options.by);
      if (!Number.isInteger(by)) throw new UsageError('--by is a whole number.');
      const result = await api.kvIncr(project.id, key, by);
      console.log(options.json ? JSON.stringify(result, null, 2) : String(result.value));
      return 0;
    }
    default:
      throw new UsageError(`Unknown action "${action}": ls, get, set, rm or incr.`);
  }
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      team: { type: 'string' },
      project: { type: 'string' },
      prod: { type: 'boolean' },
      message: { type: 'string', short: 'm' },
      token: { type: 'string' },
      'url-only': { type: 'boolean' },
      'min-score': { type: 'string' },
      'fail-on': { type: 'string' },
      json: { type: 'boolean' },
      branch: { type: 'string' },
      root: { type: 'string' },
      install: { type: 'string' },
      build: { type: 'string' },
      output: { type: 'string' },
      node: { type: 'string' },
      production: { type: 'boolean' },
      preview: { type: 'boolean' },
      period: { type: 'string' },
      ttl: { type: 'string' },
      by: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  const options: Options = values;
  try {
    switch (command) {
      case 'login':
        await login(options);
        break;
      case 'logout':
        await logout();
        break;
      case 'whoami':
        await whoami();
        break;
      case 'init':
        await init();
        break;
      case 'deploy':
        await deploy(rest[0], options);
        break;
      case 'deployments':
      case 'ls':
        await deployments(options);
        break;
      case 'promote':
        await promote(rest[0], options);
        break;
      case 'rollback':
        await rollback(options);
        break;
      case 'domains':
        await domains(rest[0], rest[1], options);
        break;
      case 'open':
        await openSite(options);
        break;
      case 'audit':
        return await audit(rest[0], options);
      case 'git':
        await git(rest[0], rest[1], options);
        break;
      case 'env':
        await env(rest[0], rest[1], rest[2], options);
        break;
      case 'hooks':
        await hooks(rest[0], rest[1], options);
        break;
      case 'builds':
        return await builds(rest[0], rest[1], options);
      case 'logs':
        return await logs(rest[0], options);
      case 'analytics':
        await analytics(options);
        break;
      case 'kv':
        return await kv(rest[0], rest[1], rest[2], options);
      default:
        throw new UsageError(`Unknown command "${command}". Run codeqlick --help.`);
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) console.error(error.message);
    else if (error instanceof ApiError) {
      console.error(
        error.status === 401
          ? 'Not signed in, or the token is invalid: run `codeqlick login`.'
          : error.message,
      );
    } else console.error((error as Error).message);
    return 1;
  }
}

// Run when executed, also through npm's bin link (not when imported by the tests).
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
