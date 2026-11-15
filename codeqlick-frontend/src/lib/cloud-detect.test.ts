import { describe, expect, it } from 'vitest';
import type { CloudDetect } from '@/lib/api/cloud';
import {
  detectNoteKeys,
  detectQuery,
  detectStatusParts,
  shouldSuggest,
  suggestedValues,
  type BuildField,
} from './cloud-detect';

const astro: CloudDetect = {
  framework: 'astro',
  buildCommand: 'npm run build',
  outputDir: 'dist',
  nodeVersion: '22',
  nodeFrom: '.nvmrc',
  notes: [],
};

describe('detectQuery', () => {
  it('reads the repository, branch and root folder', () => {
    expect(detectQuery('12:345', ' main ', ' apps/web ')).toEqual({
      installationId: 12,
      repoId: 345,
      branch: 'main',
      rootDir: 'apps/web',
    });
    expect(detectQuery('12:345', 'feat/x', '')).toEqual({
      installationId: 12,
      repoId: 345,
      branch: 'feat/x',
      rootDir: '',
    });
  });

  it('asks nothing without a repository or a valid branch', () => {
    expect(detectQuery('', 'main', '')).toBeNull();
    expect(detectQuery('12:', 'main', '')).toBeNull();
    expect(detectQuery('12:345', '', '')).toBeNull();
    expect(detectQuery('12:345', 'no spaces', '')).toBeNull();
    expect(detectQuery('12:345', 'main', 'a'.repeat(201))).toBeNull();
  });
});

describe('suggestedValues', () => {
  it('fills every field the person has not edited', () => {
    expect(suggestedValues(astro, new Set())).toEqual({
      buildCommand: 'npm run build',
      outputDir: 'dist',
      nodeVersion: '22',
    });
  });

  it('leaves the edited fields alone', () => {
    const edited = new Set<BuildField>(['outputDir', 'nodeVersion']);
    expect(suggestedValues(astro, edited)).toEqual({ buildCommand: 'npm run build' });
  });

  it('keeps an empty output folder (the root) and skips a Node version the form lacks', () => {
    expect(suggestedValues({ ...astro, outputDir: '', nodeVersion: '18' }, new Set())).toEqual({
      buildCommand: 'npm run build',
      outputDir: '',
    });
  });
});

describe('detectStatusParts', () => {
  it('names the framework and where Node came from', () => {
    expect(detectStatusParts(astro)).toEqual([
      { key: 'framework', values: { framework: 'Astro' } },
      { key: 'nodeFile', values: { version: '22', file: '.nvmrc' } },
    ]);
    expect(
      detectStatusParts({ ...astro, framework: 'cra', nodeFrom: 'engines', nodeVersion: '20' }),
    ).toEqual([
      { key: 'framework', values: { framework: 'Create React App' } },
      { key: 'nodeEngines', values: { version: '20' } },
    ]);
  });

  it('says when nothing was found, without a Node part for the default', () => {
    expect(detectStatusParts({ ...astro, framework: null, nodeFrom: null })).toEqual([
      { key: 'noFramework' },
    ]);
  });
});

describe('detectNoteKeys', () => {
  it('maps the API notes to messages, skipping unknown ones', () => {
    const notes = ['next-not-static', 'node-unsupported', 'something-new'] as CloudDetect['notes'];
    expect(detectNoteKeys({ ...astro, framework: 'next', notes })).toEqual([
      'nextNotStatic',
      'nodeUnsupported',
    ]);
  });
});

describe('shouldSuggest', () => {
  it('asks while the project is not connected', () => {
    expect(shouldSuggest('', '12:345')).toBe(true);
  });

  it('asks for another repository, never for the connected one', () => {
    expect(shouldSuggest('12:345', '12:678')).toBe(true);
    expect(shouldSuggest('12:345', '12:345')).toBe(false);
    expect(shouldSuggest('12:345', '99:345')).toBe(false);
  });
});
