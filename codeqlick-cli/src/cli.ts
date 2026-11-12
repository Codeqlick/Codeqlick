#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { Api, ApiError, type Deployment, type Project } from './api.ts';
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

const VERSION = '0.1.0';
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
  deployments               The project's deployments, newest first
  promote <id>              Publish an earlier deployment (its short id)
  rollback                  Publish the deployment before the current one
  domains [add|check|rm <domain>]   The project's own domains
  open                      Open the published site

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
    console.log(
      `Uploading ${files.length} files (${bytes(total)}, ${bytes(size)} compressed) to ${bold(project.slug)}…`,
    );
    const { commit, branch } = await gitInfo();
    const deployment = await api.deploy(project.id, bundle, {
      target: options.prod ? 'production' : 'preview',
      message: options.message,
      commit: commit && /^[0-9a-f]{4,40}$/i.test(commit) ? commit : undefined,
      branch,
    });
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

async function openSite(options: Options): Promise<void> {
  const { api } = await signedIn();
  const project = await target(api, options);
  console.log(project.url);
  openBrowser(project.url);
}

// ── Entry ─────────────────────────────────────────────────────────────────────────────────────

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
