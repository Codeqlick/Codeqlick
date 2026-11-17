import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { REALM_KEY } from './decorators/realm.decorator.js';
import { NeoqlickTargetGuard } from './guards/realm-target.guard.js';

/**
 * Every controller says which accounts it serves (architecture 4.18, decision 124), in the style of
 * `throttle-coverage.spec.ts`: the 18+ apps' member controllers are `@Realm('NEOQLICK')`, their
 * moderation (a Codeqlick admin's) has no `@Realm` and checks its targets, the account routes are
 * `@Realm('ANY')`, and everything else carries none, so it serves CODEQLICK accounts only (a route
 * without `@Realm` fails closed).
 */
const ADULT_APPS = new Set(['cruising', 'swipe', 'videochat', 'adult']);

/** The controllers of the account routes that serve both realms. */
const ANY_REALM = new Set([
  'AuthController',
  'AccountController',
  'PasskeysController',
  'SsoController',
]);

const SRC = join(import.meta.dirname, '..');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

interface Controller {
  name: string;
  file: string;
  /** First two segments of its path, e.g. `admin/cruising` or `cruising`. */
  segments: string[];
  realms: unknown;
  /** `Controller.handler [realms]` of each handler that has its own @Realm. */
  handlerRealms: string[];
  guards: unknown[];
}

async function controllers(): Promise<Controller[]> {
  const found: Controller[] = [];
  for (const file of controllerFiles(SRC)) {
    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(module)) {
      if (typeof value !== 'function') continue;
      const base: unknown = Reflect.getMetadata(PATH_METADATA, value);
      if (base === undefined) continue;
      const path = (Array.isArray(base) ? String(base[0]) : String(base)).replace(/^\/+/, '');
      const proto = (value as { prototype: Record<string, unknown> }).prototype;
      const handlerRealms = Object.getOwnPropertyNames(proto)
        .filter((key) => key !== 'constructor' && typeof proto[key] === 'function')
        .map((key) => ({
          key,
          realms: Reflect.getMetadata(REALM_KEY, proto[key] as object) as unknown,
        }))
        .filter((handler) => handler.realms !== undefined)
        .map((handler) => `${name}.${handler.key} ${JSON.stringify(handler.realms)}`);
      found.push({
        name,
        file: relative(SRC, file),
        segments: path.split('/').filter(Boolean),
        realms: Reflect.getMetadata(REALM_KEY, value),
        handlerRealms,
        guards: (Reflect.getMetadata('__guards__', value) as unknown[] | undefined) ?? [],
      });
    }
  }
  return found;
}

describe('controllers and realms', () => {
  it("declares @Realm('NEOQLICK') on every 18+ member controller", async () => {
    const all = await controllers();
    const member = all.filter((c) => ADULT_APPS.has(c.segments[0] ?? ''));
    expect(member.length).toBeGreaterThanOrEqual(15);
    const wrong = member
      .filter((c) => JSON.stringify(c.realms) !== JSON.stringify(['NEOQLICK']))
      .map((c) => `${c.name} (${c.file})`);
    expect(wrong).toEqual([]);
  }, 120_000);

  it('leaves the 18+ moderation to Codeqlick admins and checks its targets', async () => {
    const all = await controllers();
    const admin = all.filter(
      (c) => c.segments[0] === 'admin' && ADULT_APPS.has(c.segments[1] ?? ''),
    );
    expect(admin.length).toBeGreaterThanOrEqual(8);
    expect(admin.filter((c) => c.realms !== undefined).map((c) => `${c.name} (${c.file})`)).toEqual(
      [],
    );
    expect(
      admin
        .filter((c) => !c.guards.includes(NeoqlickTargetGuard))
        .map((c) => `${c.name} (${c.file})`),
    ).toEqual([]);
  }, 120_000);

  it('serves both realms only on the account routes, and declares nothing anywhere else', async () => {
    const all = await controllers();
    const anyRealm = all.filter((c) => ANY_REALM.has(c.name));
    expect(anyRealm.map((c) => c.name).sort()).toEqual([...ANY_REALM].sort());
    expect(
      anyRealm
        .filter((c) => JSON.stringify(c.realms) !== JSON.stringify(['ANY']))
        .map((c) => c.name),
    ).toEqual([]);

    const others = all.filter(
      (c) => !ANY_REALM.has(c.name) && !ADULT_APPS.has(c.segments[0] ?? ''),
    );
    expect(others.length).toBeGreaterThan(60);
    expect(
      others.filter((c) => c.realms !== undefined).map((c) => `${c.name} (${c.file})`),
    ).toEqual([]);
  }, 120_000);

  it('lets a handler differ from its controller only for the moderation images', async () => {
    const all = await controllers();
    // The admin panel streams these through the apps' own file routes, so the team's CODEQLICK
    // admins are let in next to the members.
    expect(all.flatMap((c) => c.handlerRealms).sort()).toEqual([
      'CruisingMediaController.file ["NEOQLICK","ADMIN"]',
      'CruisingMediaController.poster ["NEOQLICK","ADMIN"]',
      'SwipeController.photoFile ["NEOQLICK","ADMIN"]',
    ]);
  }, 120_000);
});
