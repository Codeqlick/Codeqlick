---
title: codeqlick.json
description: Declare redirects, rewrites, response headers, clean URLs and trailing slashes for a deployment in a codeqlick.json file, with validation before you deploy.
group: hosting
order: 6
draft: true
---

`codeqlick.json` declares how a deployment answers requests: redirects, rewrites, extra response headers, clean URLs and trailing slashes. The rules travel with your code and belong to each deployment, so a rollback restores the rules of the deployment you go back to.

## One file, two uses

The CLI already uses `codeqlick.json` to remember your team, project and folder. The same file takes the rule keys below. The CLI keeps the keys it doesn't know when it rewrites the file, so linking never drops your rules. Unknown keys are an error, so a typo such as `redirect` doesn't silently do nothing.

```json
{
  "$schema": "https://api.codeqlick.com/v1/cloud/schema/codeqlick.json",
  "team": "acme",
  "project": "web",
  "dir": "dist",
  "cleanUrls": true,
  "trailingSlash": false,
  "redirects": [{ "source": "/old/:slug", "destination": "/blog/:slug", "status": 301 }],
  "rewrites": [{ "source": "/app/*", "destination": "/app/index.html" }],
  "headers": [{ "source": "/*", "headers": { "Content-Security-Policy": "default-src 'self'" } }]
}
```

The `$schema` line makes editors such as VS Code autocomplete and check the file.

`codeqlick deploy` sends the `codeqlick.json` of the folder you run it in. Builds from Git use the one in the project's root folder. If neither is available, a `codeqlick.json` at the root of the uploaded files is used. The file is never served: `/codeqlick.json` answers `404`.

## Rules

| Key             | What it does                                                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cleanUrls`     | `true` (default): `/about` serves `about.html`. `false`: only exact files and `<folder>/index.html` are served. The `.html` address keeps working either way.                                                                                            |
| `trailingSlash` | Unset (default): both `/about` and `/about/` answer. `true`: `/about` redirects to `/about/` (308). `false`: `/about/` redirects to `/about`. It is never applied to `/`, to paths whose last segment has a file extension, or to paths nothing answers. |
| `redirects`     | A list of `{ source, destination, status? }`. `status` is 301, 302, 307 or 308 (default 308). `destination` is a path or a full `http://` or `https://` URL. The request's query string is kept unless the destination has its own.                      |
| `rewrites`      | A list of `{ source, destination }`. Serves another file of the deployment and leaves the address as it is. The destination is a path inside the deployment: Codeqlick never fetches another address.                                                    |
| `headers`       | A list of `{ source, headers }`. Adds the headers to the responses of the matching paths.                                                                                                                                                                |

## Patterns

A `source` is a path that starts with `/`. It never contains `?` or `#`: the query string is not matched. Matching is case-sensitive.

- `:name` matches one path segment.
- `*` and `:name*` match the rest of the path, including nothing: `/docs/*` also matches `/docs`.
- A destination can use the same `:name` values and `:splat` (what `*` matched).

```json
{
  "redirects": [
    { "source": "/blog/:year/:slug", "destination": "/posts/:slug", "status": 301 },
    { "source": "/docs/*", "destination": "https://docs.example.com/:splat" }
  ]
}
```

A source can have at most 5 parameters. Sources starting with `/__codeqlick/` or `/__cq_` are reserved, and a rule whose source equals its destination is refused.

## Order of evaluation

For each request, Codeqlick applies these steps and stops at the first that answers:

1. `redirects`, in file order. The first match wins, even when a file with that path exists.
2. `trailingSlash`.
3. Your files: the exact file, then `<path>.html` (with `cleanUrls`), then `<path>/index.html`.
4. `rewrites`, in file order, only when no file matched. A file always beats a rewrite.
5. The usual fallback: `200.html`, then `404.html`.

For single-page apps, a rewrite is an alternative to `200.html`:

```json
{ "rewrites": [{ "source": "/app/*", "destination": "/app/index.html" }] }
```

## Headers

Every matching `headers` rule adds its headers, in file order. When two rules set the same header, the later one wins. Headers apply to files and rewrites, not to redirects.

You can set these headers:

`Content-Security-Policy`, `Content-Security-Policy-Report-Only`, `Cache-Control`, `Permissions-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`, `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Link`, `X-Robots-Tag` and `Content-Language`.

Any other header is refused. Codeqlick sets `Strict-Transport-Security`, `X-Content-Type-Options` and `Referrer-Policy` itself and a deployment can't weaken them. `Set-Cookie`, `Content-Type`, `Content-Length`, `Content-Encoding`, `Location` and `Host` are not allowed. A `Cache-Control` rule replaces the default for those paths. `X-Robots-Tag` is added next to Codeqlick's own, so deployment addresses stay hidden from search engines.

Values are printable ASCII, up to 2 KB each. A rule has at most 20 headers.

## Limits

|                         | Free plan | PRO    |
| ----------------------- | --------- | ------ |
| Redirects plus rewrites | 100       | 2,000  |
| Header rules            | 30        | 200    |
| File size               | 64 KB     | 256 KB |

## Validate before you deploy

```sh
codeqlick config check
```

It sends your file to Codeqlick and prints what is wrong, with the exact path:

```text
redirects[3].status: must be 301, 302, 307 or 308
headers[0].headers.Strict-Transport-Security: not an allowed header
redirects: 101 rules, the free plan allows 100
```

When everything is fine it prints a summary such as `ok: 3 redirects, 1 rewrites, 2 header rules`. `codeqlick deploy` runs the same checks: a deployment with an invalid file is refused and nothing is kept. A build from Git whose file is invalid fails with the same message in its log.
