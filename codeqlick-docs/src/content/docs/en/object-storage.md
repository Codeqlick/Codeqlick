---
title: Object storage
description: Create S3-compatible buckets for a Codeqlick Cloud project, make access keys, share files from public buckets and set CORS rules.
group: services
order: 17
---

A project can have S3-compatible buckets for uploads, backups and other files. Any S3 client or SDK works.

## Create a bucket

In the project's **Storage** tab, create a bucket. A name has 3 to 63 lowercase letters, digits and dashes, and it is unique across Codeqlick Cloud. Project admins create and delete buckets.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "acme-uploads" }'
```

Or with the [CLI](/en/cli/):

```sh
codeqlick buckets create acme-uploads
codeqlick buckets ls
```

`codeqlick buckets ls` shows each bucket's size and objects against its quota, whether it is public, its CORS origins and its number of keys.

## Access keys

Make an access key for a bucket, read-only or read-write. A bucket has up to 10 keys, and a key works only for its bucket. Codeqlick shows the secret **once**, so copy it when it is shown.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets/<bucket-id>/keys" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "uploads-server", "write": true }'
```

With the CLI, a key is read-only unless you pass `--write`. It prints the access key ID and the secret once, with the endpoint and region:

```sh
codeqlick buckets key create acme-uploads --name uploads-server --write
codeqlick buckets keys acme-uploads
codeqlick buckets key rm acme-uploads uploads-server
```

Deleting a key stops it at once. `codeqlick buckets key rm` takes the key's ID, access key ID or name, and asks before it deletes.

## Connect a client

Use these settings:

| Setting                  | Value                                                  |
| ------------------------ | ------------------------------------------------------ |
| Endpoint                 | `https://s3.codeqlick.app`                             |
| Region                   | `garage`                                               |
| Addressing               | Path-style (`https://s3.codeqlick.app/<bucket>/<key>`) |
| Access key ID and secret | The key you made                                       |

With the AWS SDK for JavaScript:

```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: 'https://s3.codeqlick.app',
  region: 'garage',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

await s3.send(new PutObjectCommand({ Bucket: 'acme-uploads', Key: 'hello.txt', Body: 'Hello' }));
```

With the AWS CLI:

```sh
aws s3 ls s3://acme-uploads --endpoint-url https://s3.codeqlick.app --region garage
```

Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` first. For browsers, sign short-lived presigned URLs on your own server and hand those to the page. Don't put access keys in client-side code.

## Public buckets

A public bucket lets anyone download its files without a key. Use it for images, downloads and other assets of a site. Uploading still needs a key with write access.

Every file of a public bucket has this address:

```text
https://s3.codeqlick.app/_public/<bucket>/<key>
```

```sh
curl -I "https://s3.codeqlick.app/_public/acme-assets/images/logo.png"
```

The public address never lists a bucket. A path is a file, or a folder's `index.html` when there is one. Anything else answers `404`.

> **Warning:** anyone with the address can read every file in a public bucket. Keep private files in a bucket of their own.

HTML files open sandboxed: scripts don't run and the page has no origin of its own. Public buckets are for assets, not for sites. Put a site on [static hosting](/en/static-hosting/) instead.

Turn it on in the project's **Storage** tab with the **Public read** switch. The console asks you to confirm and then shows the public address to copy. Or use the CLI:

```sh
codeqlick buckets public acme-assets on
codeqlick buckets public acme-assets off
```

`on` asks first, unless you pass `--yes`, and prints the public address. `off` doesn't ask. Project admins make buckets public or private.

|                            | Free plan | PRO |
| -------------------------- | --------- | --- |
| Public buckets per project | 1         | 10  |

Past the limit the API answers `409`. If your team goes back to the free plan, buckets that are already public stay public. A suspended project can't make a bucket public.

## CORS rules

A browser can only call the bucket from your site's origin if the bucket allows it. Give a bucket one CORS rule, and it applies both to S3 requests and to public reads. The usual case is an upload from the browser: your server signs a presigned `PUT` URL and the page sends the file straight to the bucket.

| Field           | What it holds                                                                                              | Default       |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| `origins`       | 1 to 10 origins such as `https://example.com` or `http://localhost:3000` (no path), or `*` for any origin. | Required      |
| `methods`       | 1 to 5 of `GET`, `HEAD`, `PUT`, `POST` and `DELETE`.                                                       | `GET`, `HEAD` |
| `headers`       | Up to 20 request headers the browser may send, or `*`.                                                     | `*`           |
| `exposeHeaders` | Up to 20 response headers the page may read.                                                               | `ETag`        |
| `maxAge`        | How long the browser caches the answer to its preflight request, 0 to 86,400 seconds.                      | 3,600         |

Set it with the CLI. `set` replaces the whole rule:

```sh
codeqlick buckets cors acme-uploads set https://example.com --methods GET,PUT
codeqlick buckets cors acme-uploads                 # print the rule
codeqlick buckets cors acme-uploads clear           # remove it
```

`set` also takes `--headers a,b` and `--max-age <seconds>`. In the console, use the bucket's **CORS** form: origins one per line, the methods as checkboxes, headers and max age.

Or use the API. `PATCH` changes a bucket's `public` and `cors` fields, and answers with the changed bucket. Send `"cors": null` to remove the rule.

```sh
curl -X PATCH "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets/<bucket-id>" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "cors": { "origins": ["https://example.com"], "methods": ["GET", "PUT"] } }'
```

The same request makes a bucket public with `{ "public": true }`. Project admins change buckets. A read-only token can't.

With the rule above, a page on `https://example.com` can upload a file with a URL your server signed:

```js
// The URL comes from your server, signed with getSignedUrl and a PutObjectCommand.
await fetch(presignedUrl, { method: 'PUT', body: file });
```

## Limits

|                     | Free plan | PRO       |
| ------------------- | --------- | --------- |
| Buckets per project | 2         | 10        |
| Size of a bucket    | 1 GB      | 50 GB     |
| Objects per bucket  | 100,000   | 1,000,000 |
| Public buckets      | 1         | 10        |

Uploads past the quota are refused. The console shows each bucket's size and number of objects.

## Delete a bucket

A bucket must be empty before you delete it (`409` otherwise). Deleting it also deletes its keys.

```sh
codeqlick buckets rm acme-uploads
```

The CLI asks before it deletes. In scripts and CI, where there is no terminal to ask in, pass `--yes`.
