import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DetectedSettings } from './api.ts';
import { detectFailed, detectSummary, suggestionApplies, withSuggestion } from './cli.ts';

const astro: DetectedSettings = {
  framework: 'astro',
  buildCommand: 'npm run build',
  outputDir: 'dist',
  nodeVersion: '22',
  nodeFrom: '.nvmrc',
  notes: [],
};

test('the suggestion fills only the options not given', () => {
  assert.deepEqual(withSuggestion({}, astro), {
    buildCommand: 'npm run build',
    outputDir: 'dist',
    nodeVersion: '22',
  });
  assert.deepEqual(withSuggestion({ build: 'make', node: '20' }, astro), {
    buildCommand: 'make',
    outputDir: 'dist',
    nodeVersion: '20',
  });
  assert.deepEqual(withSuggestion({ output: '' }, astro).outputDir, '');
});

test('without a suggestion the options go as given (the API keeps its defaults)', () => {
  assert.deepEqual(withSuggestion({ output: 'public' }, null), {
    buildCommand: undefined,
    outputDir: 'public',
    nodeVersion: undefined,
  });
});

test('the summary says what was found, then the notes', () => {
  assert.deepEqual(detectSummary(astro), [
    'Detected Astro (package.json): build "npm run build", output dist, Node 22 (.nvmrc)',
  ]);
  assert.deepEqual(
    detectSummary({
      ...astro,
      framework: 'next',
      buildCommand: 'npx next build',
      outputDir: 'out',
      nodeVersion: '24',
      nodeFrom: 'engines',
      notes: ['next-not-static', 'node-unsupported'],
    }),
    [
      'Detected Next.js (package.json): build "npx next build", output out, Node 24 (engines in package.json)',
      "Note: Next.js needs output: 'export' in next.config to be served as static files.",
      "Note: The repository asks for a Node version Cloud doesn't offer: check --node.",
    ],
  );
  assert.deepEqual(
    detectSummary({
      framework: null,
      buildCommand: 'npm run build',
      outputDir: '',
      nodeVersion: '24',
      nodeFrom: null,
      notes: ['no-package-json'],
    }),
    [
      'No framework detected: build "npm run build", output ., Node 24',
      'Note: No package.json in this folder: pick the right root folder (--root), or use codeqlick deploy for a site that needs no build.',
    ],
  );
});

test('a suggestion applies to a new connection or another repository, never to the same one', () => {
  assert.equal(suggestionApplies({ repoId: null }, 42), true);
  assert.equal(suggestionApplies({ repoId: 7 }, 42), true);
  assert.equal(suggestionApplies({ repoId: 42 }, 42), false);
});

test('a failed suggestion says what is kept', () => {
  assert.equal(
    detectFailed({ repoId: null }, new Error('HTTP 503')),
    "Couldn't suggest build settings (HTTP 503): keeping the defaults.",
  );
  assert.equal(
    detectFailed({ repoId: 7 }, new Error('HTTP 404')),
    "Couldn't suggest build settings (HTTP 404): keeping the current settings.",
  );
});
