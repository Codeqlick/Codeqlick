// Builds the first preset through a running builder: `node smoke-test.mjs <url> <token>`.
const [base, token] = process.argv.slice(2);
const auth = { Authorization: `Bearer ${token}` };
const { presets } = await (await fetch(`${base}/presets`, { headers: auth })).json();
const content = { ...presets[0].content, url: 'https://ci-demo.demo.codeqlick.com' };
const response = await fetch(`${base}/build`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slug: 'ci-demo',
    preset: presets[0].key,
    domains: ['ci-demo.demo.codeqlick.com'],
    content,
  }),
});
const result = await response.json();
console.log(response.status, result);
if (!result.ok) process.exit(1);

// A draft's preview: built under its base path and served by the builder.
const draft = await fetch(`${base}/drafts`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slug: 'ci-demo',
    preset: presets[0].key,
    content,
    base: '/site-draft/ci-demo-draft-key-0001',
  }),
});
const drafted = await draft.json();
console.log(draft.status, drafted);
if (!drafted.ok) process.exit(1);
const page = await fetch(`${base}/drafts/ci-demo/`, { headers: auth });
const html = await page.text();
if (
  !page.ok ||
  !html.includes('data-edit="hero.title"') ||
  !html.includes('/site-draft/ci-demo-draft-key-0001/_astro/')
) {
  console.error('Draft preview not served as expected', page.status);
  process.exit(1);
}
const outside = await fetch(`${base}/drafts/ci-demo/..%2F..%2Fpackage.json`, { headers: auth });
if (outside.status !== 404) process.exit(1);
await fetch(`${base}/drafts/ci-demo`, { method: 'DELETE', headers: auth });
console.log('draft ok');
