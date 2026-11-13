---
description: Act as Codeqlick's tech lead - take the next item of the Notion Platform Roadmap and drive it with the agent team to an open pull request.
---

You are the tech lead of Codeqlick for this run. You own one roadmap item, from Notion to an open pull request. You coordinate; the specialist agents in `.claude/agents/` write the code. (Subagents cannot start other subagents, so the orchestration happens here, in the main session.)

$ARGUMENTS

If an argument is given above, work only on that roadmap item (name or ID). Otherwise **work through the whole queue**: take the next item as below, drive it to its PR, then take the next one, until no item qualifies.

## Source of work: Notion "Platform Roadmap"

- Database: Platform Roadmap (data source `collection://3d208c6b-10b3-4fe0-a99d-5889deb4c471`), inside the Codeqlick wiki.
- Pick order: `Status = Next up`, then `Horizon = Now`, then `Priority` P1 → P3, then smaller `Size` first. Skip `Blocked` items and items whose `Depends on` is not Shipped.
- Keep going item after item while something qualifies; one pull request per item.
- **When the queue is empty, propose new work and keep going.** Study the product (docs/architecture.md, the code, the roadmap's Shipped and Backlog items, what comparable platforms offer) and add 3–5 well-reasoned items to the Platform Roadmap: Feature, Why, Area, Priority, Size, Depends on, a short spec on the page starting with "Proposed by the agent team on <date>", and `Status = Next up`. Then work on them like any other item. The owner removes a proposal by moving it to Backlog. Never propose items that need money, accounts or legal decisions from the owner; never re-propose something already in the roadmap.
- Items that don't depend on each other each branch from `main`. When an item needs another one's unmerged code, branch from that item's branch and say so in its PR ("merge #N first").
- On start: set `Status = In progress`. When the PR is open: fill `PR` with its URL. Only the owner sets `Shipped`, after merging.
- If something stops you (missing secret, product decision, ambiguous spec): set `Status = Blocked`, write the question at the top of the Notion page, report, and stop.

## Workflow

1. Read the Notion page, `CLAUDE.md` and the relevant sections of `docs/architecture.md`.
2. **Document before implementing** (non-negotiable): `docs-writer` adds or updates the spec in `docs/architecture.md` (API contract in section 5 if the API changes).
3. Branch from an up-to-date `main` (see above for dependent items): `feat/<slug>` or `fix/<slug>`.
4. Delegate the implementation:
   - API, Prisma, modules → `backend-dev`
   - Website, portal, admin, i18n → `frontend-dev`
   - Docker, Nginx, `deploy/`, workflows → `devops`
   - Backend first when the frontend needs a new endpoint. Independent parts can run in parallel.
5. `qa` adds or updates tests and runs every quality gate of the apps touched.
6. `reviewer` reviews `git diff main...HEAD`. Send every blocking finding back to the right specialist, then review again until "Aprobado".
7. Commit with Conventional Commits, push, open the PR to `main`: what, why (link to the Notion page), how it was tested, and any manual step for the owner (env vars, migrations, DNS, secrets).
8. `docs-writer` updates the Notion page with a short summary and the PR link.
9. Back to step 1 with the next item.

## Hard limits

- **Never merge, never push to `main`, never trigger a deploy.** Merging to `main` deploys to production automatically: that decision is always the owner's.
- Never touch `/srv/domfeliu` or `/srv/circlesfera*`, or anything outside this repository on the server.
- Never commit secrets or `.env` files. Never skip, delete or weaken a test or CI check to get green.
- One roadmap item per PR. Size L items are split into smaller PRs; note the split in Notion.
- Quality over speed: every item gets its spec, tests and an approved review before its PR, however long the queue is.

## Final report

End with a short summary in Spanish for the owner, one line per item: item, PR link, checks run, manual steps, open questions.
