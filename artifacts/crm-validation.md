# CRM validation — 15 September 2026

- 38 Node tests passed: mailbox behavior, contact imports, templates, provider request contracts, workflow permissions, Codex configuration and isolated MCP access, market checkpoints, sequence dispatch, and retry classification.
- Six browser tests passed: all dashboard routes, desktop/mobile layout, contact editing and notes, CSV imports, campaign audience/activation, sequence editing and automatic sending settings, Maps jobs, and Codex research controls.
- Backend TypeScript checks passed for `crm-action`, `crm-automation`, and `mail-send`.
- Disposable PostgreSQL tests passed: migrations, team authorization and RLS, worker secrets, consent, unique claims, ordered steps, retry backoff, stale-write holds, tool-call idempotency and permissions, cancellation, reconciliation, campaign serialization, recurring schedules and DST, sequence delays, reply stops, and sending configuration validation.
- Real Edge Runtime CRM/mail tests passed against local fake authentication, database, and mail services: access checks, suppression, merge fields, opt-out footer, duplicate prevention, and uncertain outcomes.
- Scheduler/mail Edge Runtime tests passed: service-only ticks, active membership, named-operation validation, queue ownership, and non-spoofable scheduled actors. Cold-start dependency downloads required a longer readiness allowance; startup failures now include container diagnostics.
- `git diff --check` and frontend/runner syntax checks passed.

These checks use sample data and local fixtures. No real marketing messages, paid provider calls, or subscription model calls were made. Production migrations and functions have not been deployed; provider credentials and scheduler setup are installation steps.

Visual preview PNGs are generated locally under `artifacts/` and are intentionally excluded from Git.

See [CRM setup](../crm/README.md), [workflow coverage](../crm/CAPABILITIES.md), and [completion checklist](../crm/AUTOMATION-IMPLEMENTATION.md).
