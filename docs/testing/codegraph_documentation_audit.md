# CodeGraph documentation audit

**Audit date:** 2026-07-28  
**Canonical documentation:** [AGENTS.md — CodeGraph workflow](../../AGENTS.md#codegraph-workflow-canonical)

## Scope and method

Before editing documentation, the tracked Markdown inventory was collected with:

```powershell
git -c safe.directory=C:/Users/35987/Desktop/airbnb_tax ls-files "*.md"
```

Every item in that inventory was reviewed against its document purpose. CodeGraph
guidance was changed only where repository navigation, Codex instructions,
developer workflow, architecture orientation, current handoff, or the Stage 1
tracker materially need it. The local `.codegraph/` directory contains only
machine-local database, daemon, and ignore files; it contains no tracked
Markdown guidance. No `.gemini/` directory or `GEMINI.md` was found.

## Reviewed inventory

| Paths | Classification | Changed | Reason |
| --- | --- | --- | --- |
| `AGENTS.md` | agent/developer instructions | Yes | Added the canonical CodeGraph workflow, verified commands, source-inspection rule, refresh/fallback process, skill interaction, authority boundary, and local/global configuration distinction. |
| `AGENT.md` | agent/developer instructions | Yes | Links to the canonical workflow without duplicating it. |
| `CLAUDE.md` | agent/developer instructions | No | Another-agent detail guide; its existing scope is retained and it should not duplicate Codex-specific workflow. |
| `README.md` | architecture/project overview | Yes | Points contributors to the canonical workflow and availability check. |
| `DEV.md` | workflow/development guide | Yes | Adds safe setup, availability, sync, and local-index handling. |
| `architecture.md` | architecture/project overview | Yes | Records CodeGraph as non-authoritative development tooling and corrects current agency/login route descriptions. |
| `TGN.md` | architecture/project overview | Yes | Corrects current S1-D05 agency route and S1-E07 route/return graph. |
| `CURRENT_PROGRESS.md` | current-progress/handoff | Yes | Adds the current Codex/CodeGraph handoff note. |
| `DEPLOY.md` | workflow/deployment guide | No | Deployment operations do not change because of a local code-navigation index. |
| `TEST_PLAN.md` | testing/evidence documentation | No | Test criteria remain authoritative; CodeGraph discovery is linked from the canonical developer workflow. |
| `BUSINESS.md` | business strategy/reference | No | Tooling must not alter business policy. |
| `docs/STAGE_1_SOFIA_PILOT_PLAN.md` | feature/implementation plan | Yes | Marks S1-E07 in progress only, with a truthful evidence gate. |
| `docs/S1_D05_FULL_AGENCY_PARITY.md` | feature/implementation plan | No | Already accurate implementation decision/evidence boundary; no tooling instruction belongs here. |
| `docs/S1_D01_STAGE_1_CHARTER.md`, `docs/S1_D02_CONTACT_ELIGIBILITY_POLICY.md`, `docs/S1_D03_LIFECYCLE_SUPPORT_POLICY.md` | historical/approved decision | No | Approved product policy must not be revised for tooling. |
| `docs/S1_E06_NOTIFICATION_MATRIX.md`, `docs/S1_E10_MAP_GEOCODING_CAPABILITY.md` | feature/reference | No | Event/provider contracts remain unchanged. |
| `docs/MOBILE_FEASIBILITY.md`, `docs/README.md` | historical/reference | No | No material CodeGraph effect. |
| `docs/adr/0001-turnover-lineage-recovery.md`, `docs/adr/0002-contact-based-verification.md`, `docs/adr/README.md`, `docs/adr/template.md` | ADR/historical reference | No | ADRs are historical decisions and tooling must not rewrite evidence. |
| `docs/monetization/M0_MONETIZATION_CONSTRAINTS_BRIEF.md`, `docs/monetization/M1_MARKET_CUSTOMER_COMPETITOR_RESEARCH_PLAN.md`, `docs/monetization/MONETIZATION_IMPLEMENTATION_ROADMAP.md`, `docs/monetization/MONETIZATION_RESEARCH.md` | business/historical reference | No | Out of scope and not developer workflow. |
| `docs/testing/dashboard-locale-switch.tdd.md`, `docs/testing/release_blocking_privacy_fix.tdd.md`, `docs/testing/s1_e02_account_verification.tdd.md`, `docs/testing/s1_e02_account_verification_maturity_audit.md`, `docs/testing/s1_e04_overlap_prevention.tdd.md`, `docs/testing/s1_e05_lifecycle_foundation.tdd.md`, `docs/testing/s1_e05_recovery_workflows.tdd.md`, `docs/testing/s1_e06_notification_reliability.tdd.md`, `docs/testing/s1_e06_notification_reliability_maturity_audit.md`, `docs/testing/s1_e09_upload_security.tdd.md`, `docs/testing/s1_e10_geocoding_backend.tdd.md` | testing/evidence documentation | No | Historical evidence is not retroactively amended to claim CodeGraph use. |
| `docs/testing/s1_e07_conversion_routing_maturity_audit.md` | testing/evidence documentation | Yes (created) | Required S1-E07 read-only maturity audit, including CodeGraph categories and source evidence. |
| `docs/testing/s1_e07_conversion_routing.tdd.md` | testing/evidence documentation | Yes (created in this work item) | Required current evidence record; it distinguishes passed checks from open gates. |
| `docs/testing/codegraph_documentation_audit.md` | testing/evidence documentation | Yes (created) | This repository-wide audit. |
| `frontend/api/README.md`, `frontend/components/README.md`, `frontend/features/README.md`, `frontend/styles/README.md`, `frontend/tests/e2e/README.md`, `frontend/types/README.md` | module/testing reference | No | Module-specific guidance needs no duplicated repository-navigation instructions. |
| `backend/apps/locations/fixtures/README.md` | generated/reference data | No | Fixture documentation is not a Codex workflow guide. |
| `.claude/skills/django-backend-patterns/SKILL.md`, `.claude/skills/frontend-next-patterns/SKILL.md`, `.claude/skills/git-pr-workflow/SKILL.md`, `.claude/skills/host-cleaners-design/README.md`, `.claude/skills/host-cleaners-design/SKILL.md`, `.claude/skills/host-cleaners-design/assets/README.md`, `.claude/skills/host-cleaners-design/ui_kits/web/README.md` | generated/cross-agent skill reference | No | Retained because they are existing project skill assets, but do not govern Codex or supersede repository authority. |
| `.agents/skills/accessibility/SKILL.md`, `.agents/skills/api-design/SKILL.md`, `.agents/skills/architecture-decision-records/SKILL.md`, `.agents/skills/automation-audit-ops/SKILL.md`, `.agents/skills/backend-patterns/SKILL.md`, `.agents/skills/benchmark-methodology/SKILL.md`, `.agents/skills/benchmark-optimization-loop/SKILL.md`, `.agents/skills/coding-standards/SKILL.md`, `.agents/skills/competitive-platform-analysis/SKILL.md`, `.agents/skills/competitive-report-structure/SKILL.md`, `.agents/skills/context-budget/SKILL.md`, `.agents/skills/cost-tracking/SKILL.md`, `.agents/skills/customer-billing-ops/SKILL.md`, `.agents/skills/database-migrations/SKILL.md`, `.agents/skills/deep-research/SKILL.md`, `.agents/skills/deployment-patterns/SKILL.md`, `.agents/skills/django-celery/SKILL.md`, `.agents/skills/django-patterns/SKILL.md`, `.agents/skills/django-security/SKILL.md`, `.agents/skills/django-tdd/SKILL.md`, `.agents/skills/django-verification/SKILL.md`, `.agents/skills/docker-patterns/SKILL.md`, `.agents/skills/documentation-lookup/SKILL.md`, `.agents/skills/e2e-testing/SKILL.md`, `.agents/skills/error-handling/SKILL.md`, `.agents/skills/finance-billing-ops/SKILL.md`, `.agents/skills/frontend-patterns/SKILL.md`, `.agents/skills/git-workflow/SKILL.md`, `.agents/skills/iterative-retrieval/SKILL.md`, `.agents/skills/market-research/SKILL.md`, `.agents/skills/motion-ui/SKILL.md`, `.agents/skills/nextjs-turbopack/SKILL.md`, `.agents/skills/postgres-patterns/SKILL.md`, `.agents/skills/product-capability/SKILL.md`, `.agents/skills/product-lens/SKILL.md`, `.agents/skills/production-audit/SKILL.md`, `.agents/skills/python-patterns/SKILL.md`, `.agents/skills/react-patterns/SKILL.md`, `.agents/skills/react-performance/SKILL.md`, `.agents/skills/react-testing/SKILL.md`, `.agents/skills/repo-scan/SKILL.md`, `.agents/skills/research-ops/SKILL.md`, `.agents/skills/search-first/SKILL.md`, `.agents/skills/security-review/SKILL.md`, `.agents/skills/strategic-compact/SKILL.md`, `.agents/skills/tdd-workflow/SKILL.md`, `.agents/skills/verification-loop/SKILL.md`, `.agents/skills/security-review/cloud-infrastructure-security.md` | maintained local skills/reference | No | Each was reviewed as a scoped skill/reference, not a repository-wide developer guide; duplicating CodeGraph rules in them would create conflicting instructions. |

## Findings

- The previous `AGENTS.md` CodeGraph note was concise but lacked the required
  canonical workflow, availability/refresh checks, safe fallback, and local vs
  global configuration explanation. It is now canonical.
- Several architecture/status documents still said the S1-D05 `/agency`
  workspace was not built. Those current-state statements were corrected; no
  historical decision was changed.
- No obsolete command was found in the newly added CodeGraph guidance. The
  verified installed CLI supports `status`, `sync`, `index`, `explore`,
  `callers`, `impact`, and `affected`.
- There are no retained `GEMINI.md` or `.gemini/` cross-agent files. Existing
  `.claude/skills/` material remains project skill/reference content only.

## Unresolved setup questions

- None for local Codex navigation: CodeGraph MCP was available and the daemon
  reported v1.5.0 with file watching enabled.
- A full index rebuild is not scheduled; `sync`/watcher results should be
  checked after the final code batch.

## Validation commands

```powershell
git -c safe.directory=C:/Users/35987/Desktop/airbnb_tax ls-files "*.md"
codegraph --help
codegraph status .
codegraph sync .
```

The final TDD evidence records actual command results, including any
environmental blockers.
