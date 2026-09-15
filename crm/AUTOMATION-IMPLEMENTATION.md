# Automation completion

The complete upstream workflow library is available in the CRM. Named provider operations and the paired Codex runner execute the workflows; missing credentials produce a connection error, not a planning-only substitute.

## Implemented

- [x] Provider registry: Maps, LinkedIn, internet research, Prospeo, Blitz, DiscoLike, MillionVerifier, Smartlead, Instantly, Clay, Apify, and GetLeads.
- [x] Durable runs and step results, bounded retries, cancellation, recurring schedules, and checkpointed multi-provider market expansion.
- [x] Campaign sequence editor, sending windows/time zones, daily limits, autonomous launch, follow-up delays, reply stops, and uncertain-delivery reconciliation.
- [x] Provider actions, result tables, reviewed import/export, connection status, and execution history in the dashboard.
- [x] Subscription-authenticated Codex live research with configurable sub-agents, model, reasoning effort, concurrency, and timeout.
- [x] All 50 imported workflows routed through executable research and tools, with source instructions retained locally.
- [x] Contract, orchestration, database, Edge Runtime, and browser test suites, plus deployment and migration documentation.

## Runtime setup

GitHub Pages serves the static application. Supabase owns credentials, persistence, provider requests, and scheduled jobs. The paired local runner uses the user's Codex subscription and must be running for queued Codex workflows; Supabase provider and sending schedules run independently. Clay CLI builds additionally require an authenticated Clay CLI on that runner.

Provider keys, account subscriptions, deployment, and scheduler setup remain installation steps, as requested. Tests use fixtures and disposable local services, never real recipients or paid provider calls. Ambiguous writes are held for reconciliation instead of automatically replayed.

See [setup](README.md), [workflow coverage](CAPABILITIES.md), and [validation](../artifacts/crm-validation.md).
