# The Cold Email Roadmap — Which Skill Do I Use When?

One-page map from business-stage to skill. Find where you are, read the "invoke" column.

## The full linear flow (ideal path)

```
/cold-email-kickoff                  ← single entry point
    ↓
/icp-onboarding                      ← scrapes website + interview
    ↓
/lead-magnet-brainstorm              ← pick the free offer
    ↓
/campaign-strategy                   ← 15-20 campaign angles + value props
    ↓
/zapmail-domain-setup-public         ← (if no infra) — 2-week warmup wait
/smartlead-inbox-manager             ← configure warmup/signatures/tags
    ↓
/prospeo-full-export | /disco-like | /google-maps-list-builder | /blitz-list-builder | /competitor-engagers
    ↑ each invokes /icp-prompt-builder as a required step
    ↓
/list-quality-scorecard              ← grade the filtered list
    ↓
/campaign-copywriting                ← stepwise: direction → subject → body → final
    ↓

    ↓
/smartlead-campaign-upload-public    ← DRAFT only, you hit Start in UI
    ↓
(21-day wait)
    ↓
/positive-reply-scoring              ← measure
    ↓
/experiment-design                   ← plan the next variant

Ongoing: /cold-email-weekly-rhythm
```

## Stages

| Your situation | Skill to invoke | Why |
|---|---|---|
| "I'm new to cold email, where do I start?" | `/cold-email-kickoff` | Guided orchestration: ICP + lead magnet + strategy + plan |
| "I want the deeper manual tutorial" | `/cold-email-starter-kit` | 14-step reference + 60-min tutorial |
| "I need to define my ICP" | `/icp-onboarding` | Scrapes website, interviews you, outputs `client-profile.yaml` |
| "I need a free hook / offer" | `/lead-magnet-brainstorm` | 10 archetypes, scored against a 4-criterion rubric |
| "I need campaign ideas / angles" | `/campaign-strategy` | 15-25 campaign ideas with AI strategies + value props |
| "I need to write the email copy" | `/campaign-copywriting` | Stepwise direction → subject → body → final YAML |
| "Draft copy, want to QA before launch" | `/spam-word-checker` | Banned-word scan (copy QA) |
| "Copy ready, need spintax variations" | `/smartlead-spintax` | Smartlead-compatible spin |
| "I need domains to send from" | `/zapmail-domain-setup-public` | Dynadot → Zapmail end-to-end, `.com`/`.co` defaults |
| "Inboxes exist but aren't configured" | `/smartlead-inbox-manager` | Warmup, signatures (name/title/company/address), tags |
| "I need a list of leads (title-first)" | `/prospeo-full-export` | Paginated search → CSV. Required: `/icp-prompt-builder` on 50-sample first. |
| "I have target domains, need people" | `/blitz-list-builder` | Domain → contacts. Required: `/icp-prompt-builder`. |
| "I'm targeting local SMBs" | `/google-maps-list-builder` | Scrape Google Maps. Required: `/icp-prompt-builder`. |
| "I want 'more companies like X'" | `/disco-like` | Lookalike discovery via seed domains. Required: `/icp-prompt-builder`. |
| "I want leads from LinkedIn engagement" | `/competitor-engagers` | Competitor post commenters/reactors. Required: `/icp-prompt-builder`. |
| "List is built, grade it" | `/list-quality-scorecard` | 8-dim grade A+ to F + top issues |
| "Ready to launch (manual)" | `/smartlead-campaign-upload-public` | DRAFT upload, you hit Start in UI |
| "Want it fully automated" | `/auto-research-public` | 8-phase autonomous launcher |
| "I have replies, how did I do?" | `/positive-reply-scoring` | Positive reply rate (the north star) |
| "Reply rate dropped, why?" | `/email-deliverability-audit` | SPF/DKIM/DMARC + 1% rule + spam placement |
| "Things broke, what do I fix?" | `/deliverability-incident-response` | Triage decision tree |
| "Which inbox type works best?" | `/deliverability-test-public` | Gmail vs Outlook vs SMTP comparison |
| "Want to run an experiment properly" | `/experiment-design` | Single-variable framework |
| "What do I do every week?" | `/cold-email-weekly-rhythm` | Monday/Wed/Fri/monthly/quarterly playbook |

## The classic first-campaign sequence

1. `/cold-email-kickoff` → orchestrates: ICP → lead magnet → strategy → campaign plan
2. Follow the kickoff's recommended next skill:
   - **No infra:** `/zapmail-domain-setup-public` → `/smartlead-inbox-manager` → **wait 2 weeks for warmup**
   - **Infra ready:** jump straight to list building
3. Pick your list source (Prospeo, DiscoLike, Google Maps, Blitz, Competitor-Engagers) — each invokes `/icp-prompt-builder` as a required step
4. `/list-quality-scorecard` — grade the filtered list
5. `/campaign-copywriting` — write copy for the top campaign from strategy
6. `/spam-word-checker` — QA (banned words)
7. `/smartlead-campaign-upload-public` — DRAFT upload, review in Smartlead, hit Start
8. Put `/cold-email-weekly-rhythm` on your calendar
9. Campaign runs 21 days
10. `/positive-reply-scoring` → score the outcome
11. `/experiment-design` → plan campaign #2 with one variable changed

## The daily automation loop

Once you've done one campaign manually:

1. Morning: `/auto-research-public --domain=<next-target>` → fires end-to-end campaign
2. Per `/cold-email-weekly-rhythm`:
   - Monday: `/email-deliverability-audit --days=7`
   - Wednesday: `/positive-reply-scoring` on all active campaigns
   - Friday: retrospective on any campaign hitting day 21
   - Every 2 weeks: `/smartlead-inbox-manager` → inbox rotation
   - Monthly: spam placement test
   - Quarterly: experiment review

## Troubleshooting decision tree

**My campaign has 0% reply rate →**
- <100 sends: too early, wait
- 100-500 sends: `/spam-word-checker` on the copy, and manually review for vague CTAs or generic first lines
- ≥200 sends AND <1% reply rate: the 1% rule failed — run `/email-deliverability-audit` + `/deliverability-incident-response`

**Bounces >3% →**
- `/email-deliverability-audit` → `run-spam-test.ts` + `check-domain-auth.ts`
- List probably has dead emails → re-validate with MillionVerifier
- Check `/list-quality-scorecard` results retroactively

**Lots of negative replies →**
- `/positive-reply-scoring` → classify them
- If hostile-rate is high: pause, rewrite copy with `/campaign-copywriting`, lighter opener
- If just "not a fit": targeting is off, run `/experiment-design` with a new list

**Reply rate great, but no meetings booked →**
- CTA is the issue. `/lead-magnet-brainstorm` for stronger offers.
- Rewrite CTA via `/campaign-copywriting`

**Everything looks good but nothing works →**
- Domain reputation. Often "wait longer" or "replace the IP pool"
- `/deliverability-test-public` → see if one inbox type is fine and another isn't
- `/deliverability-incident-response` → full triage

**Where do I start if I have nothing?**
- `/cold-email-kickoff` → the orchestrator. Always.
