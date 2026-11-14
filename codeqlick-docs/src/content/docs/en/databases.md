---
title: Databases
description: Create a managed PostgreSQL database for a Codeqlick Cloud project, connect over TLS from your app, and know the size, connection and backup limits.
group: services
order: 16
---

A project can have managed PostgreSQL databases. Each one is a database with its own login, reachable over the internet with TLS from `pg.codeqlick.app`.

## Create a database

In the project's **Databases** tab, press **Create** and give it a name. Project admins can create, reset and delete databases. Codeqlick shows the connection string **once**, with the password:

```text
postgresql://cq_0123456789abcdef:YOUR_PASSWORD@pg.codeqlick.app:5432/cq_0123456789abcdef?sslmode=require
```

The user and the database share the same name. Codeqlick doesn't keep the password, so copy it when it is shown. If you lose it, reset it in the console. A reset replaces the password, so update your app's configuration.

You can also use the API:

```sh
curl -X POST "https://api.codeqlick.com/v1/cloud/projects/<project-id>/databases" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "main" }'
```

The answer includes `password` and the full `connectionUrl` once.

## Connect

Connections are accepted only with TLS (`sslmode=require`), and the login can reach only its own database.

```sh
psql "postgresql://cq_0123456789abcdef:YOUR_PASSWORD@pg.codeqlick.app:5432/cq_0123456789abcdef?sslmode=require"
```

Put the string in an environment variable, such as `DATABASE_URL`, for your server or your [build](/en/environment-variables/). Don't put it in code that runs in the browser. A static site should not talk to its database directly: anyone who reads your page could read the password.

```js
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query('select now()');
```

## Limits

|                       | Free plan | PRO   |
| --------------------- | --------- | ----- |
| Databases per project | 1         | 5     |
| Size of a database    | 256 MB    | 10 GB |
| Connections           | 5         | 20    |

Each query is stopped after 60 seconds.

When a database goes over its size, it becomes read-only and your team's admins get an email. When you delete data and it is under the limit again, it is writable again. Past 150% of the size, new connections are refused until the database is back under it. Contact [hello@codeqlick.com](mailto:hello@codeqlick.com) if you need help freeing space.

## Backups

Each database is dumped every day and the dumps are kept for 7 days. For now they are stored on the same server as the databases, so they protect you from mistakes, not from the loss of the server. Keep your own backups of data you can't lose. To restore a dump, write to [hello@codeqlick.com](mailto:hello@codeqlick.com).

## Delete

Deleting a database drops it at once. Its latest daily dump is kept for 7 days.
