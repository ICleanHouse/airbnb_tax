---
name: git-pr-workflow
description: Git/GitHub conventions for the two-person Host-Cleaner marketplace team — ClickUp-linked commit message format, task tag meanings (claude-ready/needs-context/human-first/env-change), the safe-directory fix for this OneDrive-synced repo, and what not to do autonomously on a ClickUp task. Use before committing, opening a PR, or starting work from a ClickUp task.
metadata:
  origin: adapted-from-ECC
  source: https://github.com/affaan-m/ECC (skills/git-workflow, skills/github-ops)
---

# Host-Cleaner Git & ClickUp Workflow

Repo: `https://github.com/ICleanHouse/airbnb_tax` (primary + team remote, two people working from it). ClickUp is connected via MCP (`https://mcp.clickup.com/mcp`) — see `CLICKUP_CLAUDE_SETUP.md` at repo root.

## When to Activate

- Starting work from a ClickUp task ID/URL.
- About to commit or open a PR.
- Unsure whether a task is safe to implement without asking first.

## If a Session Starts From a ClickUp Task

Follow this order, don't skip steps:

1. Fetch the full task — description, comments, custom fields, acceptance criteria.
2. Read `TGN.md` to find which entities/state machines the task touches.
3. Read `AGENT.md` for working rules.
4. Implement, staying inside the files the task actually names.
5. Run the relevant tests (use the task's `Test Command` custom field if set, otherwise infer from the affected app — see `django-backend-patterns` / `frontend-next-patterns` skills for commands).
6. If frontend files changed: `npm.cmd run typecheck && npm.cmd run lint`.
7. Comment on the ClickUp task summarizing what changed and any decisions made.
8. Set task status to **In Review** — not Done, not closed.

## Task Tags — Read Before Touching Anything

| Tag | Meaning |
|---|---|
| `claude-ready` | Fully spec'd, safe to implement autonomously |
| `needs-context` | Read linked tasks/comments first — may need clarification before starting |
| `human-first` | Requires a decision before coding — ask, don't implement |
| `env-change` | Touches `.env` or secrets — flag to Dimitar, do not proceed |

**No tag at all → ask before proceeding.** Don't default to "claude-ready" behavior just because a task looks simple.

## What Not to Do Autonomously on a ClickUp Task

- Change `.env` files or rotate secrets.
- Write a migration that drops a column or table without explicit instruction.
- Reassign tasks to other users.
- Close or delete tasks.
- Touch `config/settings.py` production settings without being asked.

If a task seems to require one of these, stop and say so instead of working around it.

## Commit Message Format

```
<type>(<scope>): <summary> [CU-TASK-ID]

- bullet describing main change
- bullet describing secondary change

ClickUp: https://app.clickup.com/t/TASK-ID
```

- Types: `feat`, `fix`, `refactor`, `test`, `chore`.
- Scopes: `accounts`, `marketplace`, `calendars`, `notifications`, `feedback`, `host`, `cleaner`, `admin`, `landing`.
- Omit the `[CU-TASK-ID]` tag and `ClickUp:` line entirely if the change isn't tied to a ClickUp task — don't invent a task ID.

## Repo-Specific Git Gotchas

- This repo lives on a OneDrive-synced path with spaces in it. If Git reports a safe-directory ownership warning:

```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```

- Always quote the repo path in shell commands — it contains spaces.
- Two people push to the same `ICleanHouse/airbnb_tax` remote — pull before starting new work to avoid diverging on shared files like `CLAUDE.md`, `TGN.md`, `globals.css`, and `lib/api.ts`, which both frontend and backend changes tend to touch.

## Handoff Expectations

Every substantial change should end with, in the PR description or final message:

- What changed.
- What tests or checks were run.
- Any commands that failed and why.
- Any follow-up work that's genuinely needed (not speculative nice-to-haves).
