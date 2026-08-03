# Documentation Index

Use one canonical document for each concern; avoid copying state between them.

| Need | Canonical document |
|---|---|
| Current resume point and active blockers | [CURRENT_PROGRESS.md](../CURRENT_PROGRESS.md) |
| One checklist across Stage 1 and Azure preparation | [MASTER_REMAINING_TASKS.md](../MASTER_REMAINING_TASKS.md) |
| Domain graph, states, routes, invariants | [TGN.md](../TGN.md) |
| Stage 1 scope, tracker, acceptance criteria | [STAGE_1_SOFIA_PILOT_PLAN.md](STAGE_1_SOFIA_PILOT_PLAN.md) |
| Accepted technical decisions | [adr/](adr/README.md) |
| Lifecycle/support operating policy | [S1_D03_LIFECYCLE_SUPPORT_POLICY.md](S1_D03_LIFECYCLE_SUPPORT_POLICY.md) |
| Architecture and service boundaries | [architecture.md](../architecture.md) |
| Local development and verification | [DEV.md](../DEV.md) and [TEST_PLAN.md](../TEST_PLAN.md) |
| Local production-style hosting reference | [DEPLOY.md](../DEPLOY.md) |
| Azure VM deployment preparation | [deployment/AZURE_VM_DEPLOYMENT_PLAN.md](deployment/AZURE_VM_DEPLOYMENT_PLAN.md) and [AZURE_VM_REMAINING_STEPS.md](../AZURE_VM_REMAINING_STEPS.md) |
| Azure backup, rollback, and operations requirements | [deployment/](deployment/) |
| Agent/repository rules | [AGENTS.md](../AGENTS.md) and [AGENT.md](../AGENT.md) |
| Map/geocoding capability and provider decision | [S1_E10_MAP_GEOCODING_CAPABILITY.md](S1_E10_MAP_GEOCODING_CAPABILITY.md) |
| Monetization decisions and research | [monetization/](monetization/) |
| Immutable implementation evidence | [testing/](testing/) |

Removed documents were either proposals superseded by the implemented system or
duplicated evidence now retained in the canonical document above. Historical
implementation detail should be recovered from Git history, not copied into
the active handoff.
