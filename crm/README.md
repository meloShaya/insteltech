# InstelTech CRM

The checked-in `library/skills/` files are runtime inputs for the Codex runner and its workflow-reference tool. Keep them, the library license, and `SOURCE.json` in Git. Bulk upstream prospect-list archives are optional local datasets and are ignored, along with tool databases, Supabase CLI state, and generated preview images. They are not required to deploy the CRM or run live discovery.

The static CRM at `/crm/` is hostable on GitHub Pages. Supabase provides private data, provider execution and background scheduling. The existing Resend mail dashboard remains embedded. `/crm/?demo=1` is isolated sample data and never calls live providers.

## Using the automations

- **Automation desk:** Maps search, LinkedIn profile research, internet/news search, website extraction, Prospeo, Blitz, DiscoLike, MillionVerifier, GetLeads, Apify actors, DNS and provider account operations. Results retain their source and fetch time and support table review, export and contact import.
- **Market expansion:** checkpointed Maps/DiscoLike discovery, deduplication, Blitz contact lookup, optional website research and email verification. Each checkpoint makes at most one provider request.
- **Campaigns → Sequence & schedule:** up to 20 messages, follow-up delays, weekdays, time zone, daily limits, spacing, reply stopping, launch time and automatic sending. Smartlead/Instantly publishing creates or updates provider sequences, assigns senders, uploads lead batches and optionally activates. Resend sequences run through Supabase and the existing mailbox.
- **Execution history:** ordered steps, saved results, attempts, backoff, cancellation and provider-outcome reconciliation. Unknown writes are held rather than replayed.
- **Recurring schedules:** provider operations or complete Codex workflows can repeat on selected weekdays. Scheduling respects time zones and daylight saving, and prevents overlapping runs from the same schedule.
- **Codex settings:** live web research, sub-agents, main/sub-agent models and effort, concurrency and timeout. You can enter `gpt-5.6-luna` and select `high` effort. The model must be available to the signed-in account; unsupported names cause visible errors rather than silent substitutions.

All 50 imported workflows and signal playbooks can use the connected Codex tools and their supporting source references. Write-enabled jobs can import contacts, create CRM campaign drafts/tasks, upload campaigns, run scraping actors and build/publish/run Clay workflows, within the stated objective. See [CAPABILITIES.md](./CAPABILITIES.md).

## One-time backend setup

1. Publish through the existing GitHub Pages deployment. Keep only the public Supabase URL/anon key in `env-config.js`.
2. Configure `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in GitHub's `production` environment. Run **Actions → Deploy CRM backend** with the project reference. It checks the code, applies pending migrations and deploys `crm-action`, `crm-automation` and the updated `mail-send`. Keep `forward-inbound` deployed. Inspect the migration dry-run for unrelated pending repository changes.
3. Sign in with active mailbox team membership. Complete the business profile, physical address and opt-out mailbox.
4. Add provider keys in **Supabase → Edge Functions → Secrets**. **Settings → Provider connections** displays key presence without exposing credentials. A present key is not a live account test.
5. As a workspace owner, choose **Enable scheduler** in Provider connections. This installs a one-minute Cron job and stores its server credential in Vault. Disable it from the same control.

| Capability | Supabase secret |
|---|---|
| Existing mailbox and opted-in sequences | `RESEND_API_KEY` |
| Maps Data / LinkedIn Bulk Data Scraper | `RAPIDAPI_KEY` and the relevant RapidAPI subscriptions |
| Internet/news search and extraction | `TAVILY_API_KEY` |
| Prospeo | `PROSPEO_API_KEY` |
| Blitz | `BLITZ_API_KEY` |
| DiscoLike | `DISCOLIKE_API_KEY` |
| MillionVerifier | `MILLIONVERIFIER_API_KEY` |
| Smartlead, warmup, tags, signatures, placement tests | `SMARTLEAD_API_KEY` |
| Instantly campaigns/accounts/warmup/analytics | `INSTANTLY_API_KEY` |
| Specialized LinkedIn, engagement, directory, job and ad-library actors | `APIFY_TOKEN`; select the actor and its documented inputs |
| GetLeads MCP search/export | `GETLEADS_API_KEY` |
| Existing Clay table/webhook ingestion | `CLAY_WEBHOOK_URL` |

For a Realtime LinkedIn Bulk Data subscription, set `LINKEDIN_RAPIDAPI_HOST` to `realtime-linkedin-bulk-data.p.rapidapi.com`. Otherwise the profile adapter uses the upstream `linkedin-bulk-data-scraper.p.rapidapi.com` host. Specialized company/post/engagement scraping is available through configured Apify actors and Clay playbooks.

## Subscription-backed Codex

Choose **Settings → Connect runner**, save the downloaded connection file in Downloads on a trusted computer signed into Codex with ChatGPT, and open `scripts/Start CRM Runner.command` or its Linux desktop launcher. Daily work starts from CRM buttons. The computer must remain online for Codex jobs.

The runner uses file-based ChatGPT authentication from `CODEX_HOME/auth.json` (normally `~/.codex/auth.json`) and rejects API-key authentication. It uses the subscription through the local Codex process; it does not turn a ChatGPT subscription into hosted API credits.

Each job gets an isolated temporary Codex configuration with only the CRM's scoped MCP server. Unrelated user hooks, skills and MCP servers are not copied. Provider keys remain in Supabase. The revocable runner token is scoped to assigned jobs and authorized tools, not general database access. Heartbeats preserve long jobs; cancellation stops the local process and queued child operations. An in-flight provider request may finish.

The unattended runner explicitly approves only `workflow_reference`, `provider_operation`, and `clay` in its temporary MCP configuration. The MCP server and Supabase still enforce each job's write authorization. Without these per-tool settings, Codex can reject even reference reads with “MCP tool call requires approval, but approval policy is never.” After updating the runner code, restart the local runner; changing Supabase secrets does not fix this error. To test the real subscription-backed reference call without using provider credentials or sending messages, run `INSTEL_TEST_LIVE_CODEX=1 node --test tests/crm-runner.test.mjs` (uses Codex subscription quota).

Clay builds additionally require the authenticated Clay CLI on the paired computer. The tool discovers schemas, creates/updates nodes, publishes workflows, creates routines and starts runs. Specialized actors use their own provider account entitlements.

When sub-agents are enabled, the runner retains session files inside the temporary job directory so children can find their parent. That directory is still removed after the job. `--ephemeral` is used only for jobs without sub-agents.

### Workflow execution fixes (17 September 2026)

Deploy migration `20260917100000_crm_contact_provenance.sql` before deploying the updated `crm-action` and `crm-automation` functions and static CRM files. Contact imports preserve `notes` and `raw_json`; they still set consent to false. Existing imports are not automatically repaired: recover their original evidence from execution history before updating them. Task creation accepts YYYY-MM-DD dates or ISO timestamps (retaining their written calendar date); omitted dates use the database's current day.

DiscoLike discovery maps the CRM inputs to the documented `domain`, `icp_text`, and `max_records` parameters. A provider HTTP 403 remains an access failure until a live request succeeds. Maps responses explicitly reporting a missing subscription now identify the Maps Data API and the RapidAPI application whose key needs that subscription. No credentials are included in these diagnostics.

## Sending behavior

Resend remains the mailbox and permission-based sequence provider. Its [acceptable-use policy](https://resend.com/legal/acceptable-use) excludes unsolicited cold outreach; Smartlead and Instantly provide the integrated outbound paths. Imports and verification never invent opt-in permission.

Suppression is checked before uploads and sends. Resend follow-ups share the original thread; replies stop pending follow-ups when configured, and explicit opt-outs suppress contacts globally. Scheduled mail uses the active member who configured the campaign. Unknown deliveries are reconciled against durable mailbox records. Automatic Resend retries apply only to explicit provider rate-limit refusals.

## Validation

`npm test` covers request contracts, personalization, plans, retries, checkpoints, Codex settings, scoped tools and scheduled sending. `npm run test:browser` checks the static GUI. `npm run test:db` tests migrations, RLS, leases, recurrence, sequences and reply stopping in disposable PostgreSQL. `npm run test:edge` runs the send paths in a real Edge Runtime against a local fake service. `npm run check:backend` checks all three changed edge functions.

These tests do not imply live credentials, paid API execution, delivery, production scheduling or deployment. Connect the accounts and perform controlled smoke checks after deployment.

References: [Codex configuration](https://developers.openai.com/codex/config-reference/), [Codex authentication](https://developers.openai.com/codex/auth/), [Prospeo](https://prospeo.io/api-docs/search-person), [Instantly](https://developer.instantly.ai/), [Tavily](https://docs.tavily.com/documentation/api-reference/endpoint/search). Original definitions, scripts, license and pinned revision remain in `library/`.
