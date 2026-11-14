---
title: Monitors and status pages
description: Check that your site is up, get alerted by email when a scheduled job stops running, and publish a status page for your team.
group: services
order: 12
---

Monitors tell you when something is down. A team can have 10 monitors on the free plan (PRO: 50). Create them in the console, in the team's **Monitors** tab.

## HTTP monitors

An HTTP monitor requests a URL every 5 minutes. It counts as up when the address answers with a status below 400 within 15 seconds.

- The URL uses `http` or `https`, on port 80 or 443, without credentials.
- Redirects are followed, up to 5.
- Addresses that resolve to private or reserved networks are refused.
- Codeqlick reads the certificate's expiry at most once an hour and warns you once when fewer than 14 days are left.

A monitor goes **down** after two failed checks in a row.

## Heartbeat monitors

A heartbeat monitor is the opposite: your scheduled job calls Codeqlick when it finishes, and you get an alert when it doesn't. Use it for backups, cron jobs and CI pipelines.

Create a heartbeat monitor with a **period** (1 minute to 7 days) and a **grace** time (1 minute to 1 day). Codeqlick gives you a URL such as `https://api.codeqlick.com/v1/cloud/heartbeats/cqh_…`. Call it at the end of the job:

```sh
./backup.sh && curl -fsS "https://api.codeqlick.com/v1/cloud/heartbeats/cqh_YOUR_KEY"
```

The monitor is late when no call arrives within the period plus the grace time. To report a failure at once, add `?status=fail`:

```sh
./backup.sh || curl -fsS "https://api.codeqlick.com/v1/cloud/heartbeats/cqh_YOUR_KEY?status=fail"
```

`GET` and `POST` both work. A key accepts 30 calls a minute.

## States and alerts

| State     | Meaning                                                          |
| --------- | ---------------------------------------------------------------- |
| `UNKNOWN` | No result yet.                                                   |
| `UP`      | Everything is fine.                                              |
| `DOWN`    | Two failed checks in a row, a late heartbeat, or a failure call. |
| `PAUSED`  | You switched the monitor off.                                    |

When a monitor goes down and when it comes back up, Codeqlick emails the team members you chose (1 to 10) in their language. The email includes the error and how long the monitor was down. You get at most one alert per monitor every 15 minutes in each direction. Checks are kept for 90 days.

## Status pages

Each team can publish one status page at `https://cloud.codeqlick.com/en/status/<team>`. You choose a title, an optional intro and the monitors to show, in your order, each with a public name. Visitors see:

- the overall state: all systems operational, partial outage or major outage;
- each monitor's current state and its uptime over 90 days, one bar per day;
- the incidents of the last 14 days.

The page never shows a monitor's URL. A team without an enabled page answers `404`.

The same data is available as public JSON, cached for 60 seconds, and as a small SVG badge you can put in a README:

```sh
curl https://api.codeqlick.com/v1/cloud/status/<team>
```

```markdown
![Status](https://api.codeqlick.com/v1/cloud/status/<team>/badge.svg)
```
