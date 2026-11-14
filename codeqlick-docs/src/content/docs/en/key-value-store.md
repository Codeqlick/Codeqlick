---
title: Key-value store
description: Each project has a small key-value store reached over HTTP, for settings, feature flags and counters shared by scripts, CI jobs and static sites.
group: services
order: 15
---

Every project has a key-value store. Use it for settings, feature flags, counters and data that scripts, CI jobs and servers share. Keys that start with `public:` can be read by anyone, so a static site can read them from the browser.

## Keys and values

- A key has 1 to 256 characters: letters, digits, `.`, `_`, `-` and `:`.
- A value is any JSON, up to 64 KB once serialised.
- A key can expire: set a `ttl` from 1 second to 365 days. An expired key reads as missing.

## With the CLI

From the project's folder:

```sh
codeqlick kv set feature:new-header true
codeqlick kv set banner '{"text":"Maintenance on Friday"}' --ttl 86400
codeqlick kv get feature:new-header
codeqlick kv ls feature:
codeqlick kv incr visits:home --by 1
codeqlick kv rm feature:new-header
```

The value is read as JSON, or as text when it isn't valid JSON. A `-` as the value reads standard input.

## With the API

Sign in with a token ([API tokens](/en/api-tokens/)). Any team member's token can read and write.

```sh
BASE="https://api.codeqlick.com/v1/cloud/projects/<project-id>/kv"

# write (with an optional ttl in seconds)
curl -X PUT "$BASE/feature:new-header" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "value": true, "ttl": 3600 }'

# read
curl "$BASE/feature:new-header" -H "Authorization: Bearer $CODEQLICK_TOKEN"

# list by prefix
curl "$BASE?prefix=feature:&limit=50" -H "Authorization: Bearer $CODEQLICK_TOKEN"

# delete
curl -X DELETE "$BASE/feature:new-header" -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

An atomic counter avoids race conditions. A missing key starts at 0, and `by` is an integer (default 1):

```sh
curl -X POST "$BASE/visits:home/incr" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "by": 1 }'
# { "key": "visits:home", "value": 42 }
```

It answers `409` when the existing value isn't an integer.

## Public reads

A key that starts with `public:` is readable by anyone, at `https://api.codeqlick.com/v1/cloud/kv/<project>/<key>`. The answer allows any origin (CORS) and is cached for 10 seconds.

```sh
curl "https://api.codeqlick.com/v1/cloud/kv/web/public:banner"
```

```js
const banner = await fetch('https://api.codeqlick.com/v1/cloud/kv/web/public:banner').then(
  (response) => (response.ok ? response.json() : null),
);
```

Any other key, and a suspended or deleted project, answers `404`. Nothing can be written without a token. Never put secrets in a `public:` key. Public reads are limited to 120 a minute per IP.

## Limits

|                  | Free plan               | PRO     |
| ---------------- | ----------------------- | ------- |
| Keys per project | 1,000                   | 100,000 |
| Data per project | 10 MB                   | 1 GB    |
| Requests         | 600 a minute per caller |         |

Past the limits a write answers `409`.
