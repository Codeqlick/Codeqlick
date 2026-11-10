import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_NAMESPACES, BASE_CLIENT_NAMESPACES } from './client-namespaces';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Top-level namespaces 'use client' files read: `useTranslations('X…')` and `namespace="X…"`. */
function clientNamespaces(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const isClient = /^\s*['"]use client['"]/.test(text);
    const pattern = isClient
      ? /useTranslations\(\s*['"`]([A-Za-z]+)|namespace=["']([A-Za-z]+)/g
      : /namespace=["']([A-Za-z]+)/g;
    for (const match of text.matchAll(pattern)) found.add((match[1] ?? match[2])!);
  }
  return found;
}

describe('client namespaces', () => {
  it('hands Client Components every namespace they read', () => {
    const handed = new Set<string>([
      ...BASE_CLIENT_NAMESPACES,
      ...Object.values(APP_NAMESPACES).flat(),
    ]);
    const missing = [...clientNamespaces()].filter((namespace) => !handed.has(namespace));
    expect(missing).toEqual([]);
  });
});
