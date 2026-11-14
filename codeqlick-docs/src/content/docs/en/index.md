---
title: Codeqlick Cloud documentation
description: Codeqlick Cloud hosts your static sites and adds forms, analytics, a key-value store, databases and storage. See what you get and what is free.
group: start
order: 1
---

Codeqlick Cloud is a set of developer tools for web projects. You build your site, deploy it from your terminal or from Git, and add services to it without running a server yourself.

## What you get

- **[Static hosting](/en/static-hosting/):** every deployment gets its own address, you publish one of them, and you roll back in a second.
- **[Custom domains](/en/custom-domains/):** serve your site on your own domain with an automatic HTTPS certificate.
- **[Builds from Git](/en/builds-from-git/):** connect a GitHub repository and every push is built and published. Pull requests get preview addresses.
- **[Forms](/en/forms/):** post an HTML form to Codeqlick and get each submission by email and in the console.
- **[Monitors and status pages](/en/monitors-and-status-pages/):** uptime checks, cron heartbeats and a public status page.
- **[Web analytics](/en/analytics/):** count visits without cookies.
- **[Key-value store](/en/key-value-store/):** a small store reached over HTTP for settings, flags and counters.
- **[Databases](/en/databases/):** managed PostgreSQL.
- **[Object storage](/en/object-storage/):** S3-compatible buckets.
- **[The `codeqlick` command line](/en/cli/):** everything above from your terminal and from CI.

## How it is organised

You work in a **team**. A team owns **projects**, and each project is one deployable thing, such as a site. A project's name becomes its address: a project called `web` lives at `https://web.codeqlick.app`.

Everything in the console at [cloud.codeqlick.com](https://cloud.codeqlick.com) is also available through the CLI and the HTTP API under `https://api.codeqlick.com/v1/cloud`. Scripts and CI jobs sign in with an [API token](/en/api-tokens/).

## What is free

The free plan has no trial period. It includes 10 projects per team, 1 GB of storage per team, 200 builds a month, 1,000 form submissions a month, 50,000 analytics events a month and more. The [plans and limits](/en/plans-and-limits/) page lists every limit and what the PRO plan raises.

## Where to go next

Follow the [quickstart](/en/quickstart/) to deploy your first site in a few minutes.
