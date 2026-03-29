# Documentation Index

This folder contains active, maintenance-focused documentation.

## Core Docs

| Document | Purpose |
|----------|---------|
| `QUICKSTART.md` | Local development setup, running backend + frontends, testing |
| `ARCHITECTURE.md` | System architecture, backend layering, data flows, service dependencies |
| `ONBOARDING.md` | New developer guide: codebase tour, key concepts, how to add features |
| `DYNAMODB_SCHEMA.md` | DynamoDB single-table design, key patterns, access patterns |
| `AUTH_CURRENT_STATE_AND_PLAN.md` | Current auth model, required env vars, rollout/hardening checklist |

## Operations

| Document | Purpose |
|----------|---------|
| `ORAL_ASSESSMENT_DEPLOYMENT.md` | Canonical production deployment runbook (Terraform, OIDC, SSM) |
| `PLATFORM_PLAN.md` | Product roadmap, 9-sprint plan, user stories, cost estimates |
| `ANALYTICS_LOGGING.md` | Event telemetry design, privacy constraints, verification |

## Scope Rule

This folder should contain:
- Current system behavior
- Operational runbooks
- Architecture references

This folder should **not** contain:
- Milestone completion reports
- Historical migration notes after cutover is complete
- Temporary refactor execution logs

If a document no longer helps with current development or operations, delete it.
