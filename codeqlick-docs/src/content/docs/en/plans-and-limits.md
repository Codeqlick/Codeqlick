---
title: Plans and limits
description: The limits of the Codeqlick Cloud free plan and what the PRO plan raises, for hosting, builds, forms, monitors, analytics, databases and storage.
group: reference
order: 20
---

Codeqlick Cloud has a free plan and a PRO plan. Each team has one plan. All limits below are per team unless a row says otherwise.

## Limits

|                                   | Free    | PRO       |
| --------------------------------- | ------- | --------- |
| **Teams and people**              |         |           |
| Teams you own                     | 3       | 3         |
| Teams you belong to               | 10      | 10        |
| Members per team                  | 10      | 50        |
| API tokens per person             | 20      | 20        |
| **Hosting**                       |         |           |
| Projects per team                 | 10      | 50        |
| Storage per team                  | 1 GB    | 20 GB     |
| Size of a deployment              | 100 MB  | 500 MB    |
| Files in a deployment             | 10,000  | 50,000    |
| Upload size                       | 50 MB   | 50 MB     |
| Deployments per hour              | 30      | 120       |
| Custom domains per project        | 5       | 20        |
| **Builds**                        |         |           |
| Builds per month                  | 200     | 3,000     |
| Minutes per build                 | 15      | 30        |
| Environment variables per project | 50      | 200       |
| Notification channels per project | 5       | 20        |
| **Services**                      |         |           |
| Forms per project                 | 3       | 20        |
| Form submissions per month        | 1,000   | 20,000    |
| Monitors                          | 10      | 50        |
| Website checks per hour           | 20      | 200       |
| Analytics events per month        | 50,000  | 1,000,000 |
| Key-value keys per project        | 1,000   | 100,000   |
| Key-value data per project        | 10 MB   | 1 GB      |
| Databases per project             | 1       | 5         |
| Size of a database                | 256 MB  | 10 GB     |
| Connections per database          | 5       | 20        |
| Buckets per project               | 2       | 10        |
| Size of a bucket                  | 1 GB    | 50 GB     |
| Objects per bucket                | 100,000 | 1,000,000 |

Monthly limits are counted per calendar month in Madrid time. Codeqlick keeps the last 20 deployments of each project plus its production deployment.

Traffic is fair use. Each address is limited to 50 requests per second, with bursts of 100, and Codeqlick tells your team before suspending anything for traffic.

## See your usage

The console's **Usage** page shows your plan, your limits and what you use. With the API:

```sh
curl "https://api.codeqlick.com/v1/cloud/teams/<team>/usage" \
  -H "Authorization: Bearer $CODEQLICK_TOKEN"
```

## Upgrade to PRO

A team's owners upgrade in the console's **Plan** page. It shows the monthly price, plus VAT, and sends you to Stripe to pay. The team becomes PRO as soon as the payment completes. Owners can also manage the card, see invoices and cancel from the same page, through Stripe's customer portal. Admins and members can see the plan.

If a payment fails, the team stays PRO while Stripe retries and the owners get an email. When a subscription ends, the team goes back to the free plan.

## Going back to free

Going back deletes nothing. What is over the free limits keeps working, but you can't add more: the API answers `409` and names the limit. The monthly limits, such as builds, analytics events and form submissions, apply at once.

## When you reach a limit

| Limit                          | What happens                                                               |
| ------------------------------ | -------------------------------------------------------------------------- |
| Deployments, storage, projects | The request is refused with a clear reason (`400`, `409`, `413` or `429`). |
| Builds in a month              | New builds are refused and marked failed, with a note in the console.      |
| Form submissions in a month    | Posts get `429` and the owners get one email that month.                   |
| Analytics events in a month    | Events are dropped and the owners get one email that month.                |
| Database size                  | The database becomes read-only until it is under the limit.                |
| Bucket size                    | Uploads past the quota are refused.                                        |
