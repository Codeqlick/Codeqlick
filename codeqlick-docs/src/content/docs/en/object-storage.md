---
title: Object storage
description: Create S3-compatible buckets for a Codeqlick Cloud project, make access keys and use them with any S3 client or SDK.
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

## Access keys

Make an access key for a bucket, read-only or read-write. A bucket has up to 10 keys, and a key works only for its bucket. Codeqlick shows the secret **once**, so copy it when it is shown.

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/buckets/<bucket-id>/keys" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "uploads-server", "write": true }'
```

Deleting a key stops it at once.

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

Public buckets and CORS rules are not available yet.

## Limits

|                     | Free plan | PRO       |
| ------------------- | --------- | --------- |
| Buckets per project | 2         | 10        |
| Size of a bucket    | 1 GB      | 50 GB     |
| Objects per bucket  | 100,000   | 1,000,000 |

Uploads past the quota are refused. The console shows each bucket's size and number of objects.

## Delete a bucket

A bucket must be empty before you delete it (`409` otherwise). Deleting it also deletes its keys.
