import { describe, expect, it } from 'vitest';
import { buildEnvRows, type EnvVarRow } from './cloud-env.js';
import { envKeyQuerySchema, envVarSchema, isGitBranchName } from './cloud.schemas.js';

const row = (
  key: string,
  value: string,
  production: boolean,
  preview: boolean,
  branch = '',
): EnvVarRow & { value: string } => ({ key, value, production, preview, branch });

const rows = [
  row('API_KEY', 'prod-key', true, false),
  row('API_URL', 'general', true, true),
  row('API_URL', 'staging-url', false, true, 'staging'),
  row('API_URL', 'other-url', false, true, 'feature/other'),
  row('DEBUG', 'on', false, true),
  row('ONLY_STAGING', 'yes', false, true, 'staging'),
];
const values = (list: Array<{ key: string; value: string }>) =>
  Object.fromEntries(list.map((r) => [r.key, r.value]));

describe('buildEnvRows', () => {
  it('gives production the general production variables and never a branch one', () => {
    expect(values(buildEnvRows(rows, 'PRODUCTION', 'main'))).toEqual({
      API_KEY: 'prod-key',
      API_URL: 'general',
    });
    // Even when the production branch has the name of a branch variable.
    expect(values(buildEnvRows(rows, 'PRODUCTION', 'staging'))).toEqual({
      API_KEY: 'prod-key',
      API_URL: 'general',
    });
  });

  it("gives a preview its branch's variables over the general ones", () => {
    expect(values(buildEnvRows(rows, 'PREVIEW', 'staging'))).toEqual({
      API_URL: 'staging-url',
      DEBUG: 'on',
      ONLY_STAGING: 'yes',
    });
    expect(values(buildEnvRows(rows, 'PREVIEW', 'feature/other'))).toEqual({
      API_URL: 'other-url',
      DEBUG: 'on',
    });
  });

  it('gives any other preview the general preview variables', () => {
    expect(values(buildEnvRows(rows, 'PREVIEW', 'header'))).toEqual({
      API_URL: 'general',
      DEBUG: 'on',
    });
    expect(buildEnvRows([], 'PREVIEW', 'header')).toEqual([]);
  });

  it('does not depend on the order of the rows', () => {
    expect(values(buildEnvRows([...rows].reverse(), 'PREVIEW', 'staging'))).toMatchObject({
      API_URL: 'staging-url',
    });
  });
});

describe('isGitBranchName', () => {
  it('takes the names Git takes', () => {
    for (const name of ['staging', 'feature/new-header', 'release-1.2', 'user@x', 'v2_beta']) {
      expect(isGitBranchName(name), name).toBe(true);
    }
  });

  it('refuses the names Git refuses', () => {
    for (const name of [
      'a b',
      'tab\there',
      'bell\u0007',
      'a~1',
      'a^',
      'a:b',
      'a?',
      'a*',
      'a[b',
      'a\\b',
      'a..b',
      'a//b',
      'a@{1}',
      '@',
      '-flag',
      '/abs',
      'trailing/',
      'trailing.',
      'refs.lock',
      'feature/x.lock',
      '.hidden',
      'feature/.hidden',
    ]) {
      expect(isGitBranchName(name), name).toBe(false);
    }
  });
});

describe('envVarSchema', () => {
  const base = { key: 'API_URL', value: 'https://staging.example.com' };

  it('takes a preview-only variable for one branch and trims the branch', () => {
    expect(
      envVarSchema.parse({ ...base, production: false, preview: true, branch: ' staging ' }),
    ).toMatchObject({ branch: 'staging', production: false, preview: true });
    expect(envVarSchema.parse({ ...base, production: true, preview: true })).not.toHaveProperty(
      'branch',
    );
  });

  it('refuses a branch variable for production or without previews', () => {
    for (const targets of [
      { production: true, preview: true },
      { production: true, preview: false },
    ]) {
      const result = envVarSchema.safeParse({ ...base, ...targets, branch: 'staging' });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([['branch']]);
    }
    const neither = envVarSchema.safeParse({
      ...base,
      production: false,
      preview: false,
      branch: 'staging',
    });
    expect(neither.success).toBe(false);
  });

  it('refuses a branch Git would not take, an empty one or a long one', () => {
    for (const branch of ['', '   ', 'a b', 'a..b', 'x'.repeat(201)]) {
      expect(
        envVarSchema.safeParse({ ...base, production: false, preview: true, branch }).success,
        branch,
      ).toBe(false);
    }
  });
});

describe('envKeyQuerySchema', () => {
  it('takes a key with or without a branch', () => {
    expect(envKeyQuerySchema.parse({ key: 'API_URL' })).toEqual({ key: 'API_URL' });
    expect(envKeyQuerySchema.parse({ key: 'API_URL', branch: 'feature/x' })).toEqual({
      key: 'API_URL',
      branch: 'feature/x',
    });
    expect(envKeyQuerySchema.safeParse({ key: 'API_URL', branch: 'a:b' }).success).toBe(false);
  });
});
