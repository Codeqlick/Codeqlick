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
