import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';

/**
 * Every public route that changes something (POST, PUT, PATCH, DELETE without a session) carries
 * its own `@Throttle` (architecture 4.1, decision 109): the global 100 a minute per IP is a ceiling
 * for reads, not a limit for sign-ups, forms and reports. Routes that must not be limited by IP
 * are listed here with the reason and their own protection.
 */
const EXEMPT: Record<string, string> = {
  // Stripe and GitHub call from a few IPs for every customer; each call's signature is checked.
  'POST /payments/stripe': 'signed by Stripe',
  'POST /cloud/github/webhook': 'signed by GitHub',
  // Limited per hook and per IP in the service (architecture 4.13, deploy hooks).
  'POST /cloud/hooks/:token': 'own per-hook and per-IP limits',
  // Cloud's build agent (one machine) with its secret, streaming logs: never limited by IP.
  'POST /cloud/builder/claim': "the build agent's secret",
  'POST /cloud/builder/builds/:id/log': "the build agent's secret",
  'POST /cloud/builder/builds/:id/heartbeat': "the build agent's secret",
  'POST /cloud/builder/builds/:id/finish': "the build agent's secret",
};

const SRC = join(import.meta.dirname, '..');
const MUTATIONS = new Set<number>([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

function joinPath(base: unknown, path: unknown): string {
  const parts = [base, path]
    .flatMap((part) => (Array.isArray(part) ? [part[0]] : [part]))
    .filter((part): part is string => typeof part === 'string' && part !== '' && part !== '/');
  return `/${parts.map((part) => part.replace(/^\/+|\/+$/g, '')).join('/')}`;
}

function throttled(target: object): boolean {
  return Reflect.getMetadataKeys(target).some(
    (key) => typeof key === 'string' && key.startsWith('THROTTLER:LIMIT'),
  );
}

function skipped(target: object): boolean {
  return Reflect.getMetadata('THROTTLER:SKIPdefault', target) === true;
}

interface Route {
  route: string;
  file: string;
  limited: boolean;
}

async function publicMutations(): Promise<Route[]> {
  const routes: Route[] = [];
  for (const file of controllerFiles(SRC)) {
    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const controller of Object.values(module)) {
      if (typeof controller !== 'function') continue;
      const base: unknown = Reflect.getMetadata(PATH_METADATA, controller);
      if (base === undefined) continue;
      const proto = (controller as { prototype: Record<string, unknown> }).prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
        if (typeof method !== 'number' || !MUTATIONS.has(method)) continue;
        const isPublic =
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
        if (!isPublic) continue;
        const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        routes.push({
          route: `${RequestMethod[method]} ${joinPath(base, path)}`,
          file: relative(SRC, file),
          limited:
            (throttled(handler) || throttled(controller)) &&
            !skipped(handler) &&
            !skipped(controller),
        });
      }
    }
  }
  return routes;
}

describe('rate limits of public mutations', () => {
  it('gives every public POST, PUT, PATCH and DELETE its own @Throttle', async () => {
    const routes = await publicMutations();
    expect(routes.length).toBeGreaterThan(20);
    const missing = routes
      .filter((route) => !route.limited && !(route.route in EXEMPT))
      .map((route) => `${route.route} (${route.file})`);
    expect(missing).toEqual([]);
  }, 120_000);

  it('lists only exemptions that still exist', async () => {
    const routes = new Set((await publicMutations()).map((route) => route.route));
    expect(Object.keys(EXEMPT).filter((route) => !routes.has(route))).toEqual([]);
  }, 120_000);
});
