# Host Cleaners Skill Router

Project documentation remains authoritative.

Priority order:

1. `TGN.md`
2. `AGENT.md`
3. `BUSINESS.md`
4. `architecture.md`
5. `DEV.md`
6. `CURRENT_PROGRESS.md`
7. ECC skills

ECC skills provide techniques and checklists. They must not override locked
business rules, architecture decisions, API conventions, or project-specific
instructions.

## Daily skills

Use only when relevant to the current task:

- Django/DRF/models/serializers/services:
  `django-patterns`
- Django tests:
  `django-tdd`
- Final backend checks:
  `django-verification`
- Authentication, CSRF, permissions, ownership:
  `django-security`
- Python implementation:
  `python-patterns`
- API route or response design:
  `api-design`
- API and UI error handling:
  `error-handling`
- React/Next.js components:
  `frontend-patterns`, `react-patterns`
- Frontend tests:
  `react-testing`
- Rendering or performance problems:
  `react-performance`
- Forms, dialogs, keyboard navigation:
  `accessibility`
- Motion transitions:
  `motion-ui`
- PostgreSQL and queries:
  `postgres-patterns`
- Schema changes:
  `database-migrations`
- Before declaring work complete:
  `verification-loop`
- Regression-first implementation:
  `tdd-workflow`
- Large repository investigation:
  `iterative-retrieval`

## Library skills

Load only for explicit matching work:

- Browser workflows: `e2e-testing`
- Release readiness: `production-audit`
- Security audit: `security-review`, `security-scan`
- AI-generated-code regressions: `ai-regression-testing`
- Formal evaluations: `eval-harness`
- New module orientation: `code-tour`
- Skill cleanup: `agent-sort`, `skill-stocktake`
- Long-session context management: `strategic-compact`
- Market research: `market-research`, `deep-research`
- GitHub operations: `github-ops`
- Cost reviews: `cost-tracking`

## Prohibited behavior

- Do not load all ECC skills for every task.
- Do not use multi-agent orchestration for small fixes.
- Do not introduce another framework solely because an ECC skill recommends it.
- Do not add payments; they are outside v1 scope.
- Do not replace session-cookie authentication with JWT without explicit approval.
- Do not add a CSS framework; the project uses `globals.css`.
- Do not call `fetch` directly; use `apiFetch`.