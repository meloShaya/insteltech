# InstelTech website and mail portal

This repository contains the InstelTech marketing website, giveaway pages, Supabase Edge Functions, and the private mobile mail portal for `insteltech.co.zw`.

## Quick answer: where does each part run?

| Feature                     | Runs in                                         | Private file/secret source                                               |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| Public website              | Browser and static hosting                      | None; `env-config.js` contains only the public Supabase URL and anon key |
| Contact/giveaway processing | Deployed Supabase Edge Functions                | Supabase function secrets                                                |
| Mobile inbox and composer   | `https://insteltech.co.zw/mail/` in the browser | Supabase Auth session; no Resend key                                     |
| Mail sending/receiving      | Supabase Edge Functions → Resend                | `RESEND_API_KEY` in Supabase                                             |
| Manual PDF sender           | This PC’s Node.js terminal                      | `RESEND_API_KEY` in that terminal                                        |

The new portal is the recommended way to send from a phone. Log in at:

```text
https://insteltech.co.zw/mail/
```

The portal is not a local script. The browser calls authenticated Supabase functions, and those functions use the Resend key stored in Supabase. The standalone script under `scripts/` remains useful from a trusted computer, but it does not run inside Supabase and cannot automatically see Supabase’s deployed secrets or your PC’s PDF files.

## Project layout

```text
.
├── index.html                         Main website page
├── about.html                         About page
├── contact.html                       Contact page
├── script.js                          Contact form behavior
├── styles.css                         Main website styles
├── env-config.js                      Public Supabase URL and anon key
├── giveaway.html                      Giveaway form
├── giveaway.js                        Giveaway behavior
├── giveaway-confirmation.html         Giveaway confirmation page
├── giveaway-leaderboard.html          Public leaderboard
├── giveaway-styles.css                Giveaway styles
├── images/                            Site assets
├── mail/
│   ├── index.html                     Mobile mail portal
│   ├── mail.js                        Auth, inbox, compose, and reply behavior
│   └── mail.css                       Portal styles
├── scripts/
│   ├── send-client-email.mjs          Manual local PDF sender
│   └── README.md                      Manual sender notes
└── supabase/
    ├── config.toml                    Function configuration
    ├── functions/
    │   ├── _shared/mail.ts             Mail constants and helpers
    │   ├── mail-send/                  Authenticated outgoing mail function
    │   ├── notify-lead/                New-lead notification
    │   ├── submit-giveaway-entry/     Entry storage and notification
    │   └── forward-inbound/            Webhook ingestion and backup forwarding
    └── migrations/                    Database schema changes
```

## Deploy the mobile portal

The portal requires the existing Supabase project and a verified Resend domain.

### 1. Apply the database migration

From a machine with the Supabase CLI linked to this project, apply the migration:

```bash
npx supabase db push
```

The migration creates private mail threads, messages, attachment metadata, team membership, Row Level Security policies, and the private `mail-attachments` Storage bucket.

### 2. Confirm Supabase secrets

The deployed functions need these server-side values:

```text
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
FORWARD_TO_EMAIL          optional; defaults to the existing personal inbox
FORWARD_FROM_EMAIL        optional; defaults to forwarder@insteltech.co.zw
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never copy any of these values into `env-config.js`, `mail/mail.js`, browser requests, or this README.

Set project-wide function secrets through the Supabase CLI or Dashboard. For example, from the linked project:

```bash
supabase secrets set \
  RESEND_API_KEY="paste-the-resend-key-here" \
  RESEND_WEBHOOK_SECRET="paste-the-webhook-secret-here" \
  FORWARD_TO_EMAIL="your-backup-inbox@example.com" \
  FORWARD_FROM_EMAIL="forwarder@insteltech.co.zw"
```

Use your real values only in the terminal prompt or Supabase secret manager; do not commit this example with real credentials.

### 3. Deploy the mail functions

```bash
npx supabase functions deploy mail-send
npx supabase functions deploy forward-inbound
```

`mail-send` keeps JWT verification enabled and accepts requests only from active `mail_members`. `forward-inbound` remains a public webhook endpoint because Resend calls it; it verifies the Resend/Svix webhook signature before doing any work.

### 4. Add the team members

Invite each person through the Supabase Dashboard under Authentication → Users. After an invitation creates the Auth user, add that user to the allowlist in the Supabase SQL Editor:

```sql
insert into public.mail_members (user_id, role)
values ('AUTH_USER_UUID_HERE', 'owner');
```

Use `member` for normal staff accounts. Only active allowlisted users can read the shared inbox, download attachments, or send mail. There is no public signup form.

### 5. Configure Auth and Resend

In Supabase Auth settings:

- set the site URL to `https://insteltech.co.zw`;
- add `https://insteltech.co.zw/mail/` as an allowed redirect URL; and
- require verified email addresses and MFA for team accounts before production use.

In Resend:

- confirm `insteltech.co.zw` is verified for sending and receiving;
- keep the domain’s inbound MX configuration active;
- configure an `email.received` webhook to the deployed function URL:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/forward-inbound
```

- copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`.

The inbound function stores received messages and attachments in Supabase, then continues forwarding them to the existing personal inbox during rollout.

### 6. Publish the static site

Publish the repository’s static files using the existing hosting process. The new `mail/` directory must be included. Once published, open `https://insteltech.co.zw/mail/` on a phone and sign in with an invited account.

## Using the portal

1. Open `https://insteltech.co.zw/mail/`.
2. Sign in with an invited team account.
3. Select a conversation or choose **New email**.
4. Enter the client address, subject, and message.
5. Attach one or more PDFs and choose **Send email**.
6. Confirm the sent message and delivery status in the thread.

Every message is sent as:

```text
InstelTech Marketing <marketing@insteltech.co.zw>
```

The first portal release intentionally focuses on core mail: inbox threads, message reading, attachment downloads, compose, reply, subject search, and sent/error status. Drafts, folders, spam controls, bulk actions, and advanced Gmail-style search are not included.

## Manual PDF sender — this PC only

Use [scripts/send-client-email.mjs](scripts/send-client-email.mjs) when you are working from a trusted computer. It reads a local PDF and sends it directly to Resend; it is not deployed to Supabase.

```bash
read -r -s RESEND_API_KEY
export RESEND_API_KEY

node scripts/send-client-email.mjs \
  --to client@example.com \
  --pdf "/absolute/path/to/document.pdf" \
  --subject "Your InstelTech document" \
  --message $'Dear Team,\n\nPlease find your document attached.\n\nKind regards,\n\nInstel Technologies'
```

Run `--dry-run` first. The script validates the PDF and prints the recipient, fixed sender, subject, filename, and size without contacting Resend. See [scripts/README.md](scripts/README.md) for the full manual-sending notes.

## Existing email flows

| Function                | Trigger                         | Effect                                                                               |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `notify-lead`           | Website contact form            | Stores/sends a new-lead notification to the configured internal inbox.               |
| `submit-giveaway-entry` | Giveaway form                   | Stores the entry and sends an internal notification.                                 |
| `forward-inbound`       | Resend `email.received` webhook | Stores inbound mail, stores attachments, groups threads, and forwards a backup copy. |
| `mail-send`             | Authenticated portal request    | Sends a message from `marketing@insteltech.co.zw` and records its status.            |

The browser may contain the public Supabase URL and anon key. It must never contain `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `RESEND_WEBHOOK_SECRET`.

## Local website preview

There is no frontend build step. From the repository root, run a static server such as:

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>. The local portal can be previewed at <http://localhost:8080/mail/>, but it will only work after the Supabase Auth redirect URL includes the local address and the migration/functions are deployed or running locally.

## Troubleshooting

| Symptom                                     | Check first                                                                                 | Safe response                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Portal shows configuration missing          | `env-config.js` is present and contains the public Supabase values.                         | Do not add the Resend key to that file.                     |
| Login succeeds but inbox is empty/forbidden | The Auth user exists in `mail_members` and `active` is true.                                | Add or correct membership in Supabase SQL Editor.           |
| Sending fails with 401/403                  | The session is valid, membership is active, and `RESEND_API_KEY` is configured in Supabase. | Do not paste the key into the browser.                      |
| PDF upload fails                            | The file is a PDF and the total upload is below 25 MB.                                      | Do not retry with an unknown or stale file.                 |
| Inbound mail is missing                     | Resend webhook URL/signing secret, MX records, and `forward-inbound` logs.                  | Keep the personal forwarding backup enabled during rollout. |
| A send times out                            | Check Resend delivery/message status before retrying.                                       | Do not blindly resend; this can duplicate the email.        |
| From address is rejected                    | The sending domain is verified and `marketing@insteltech.co.zw` is allowed.                 | Do not change the sender to an unverified domain.           |

## Verification commands

These local checks do not send email:

```bash
node --check scripts/send-client-email.mjs
node scripts/send-client-email.mjs --help
```

For a live acceptance test, use a non-sensitive PDF and a test mailbox. Confirm login, upload, sender identity, attachment delivery, inbound storage, backup forwarding, reply threading, and the duplicate-send guard before inviting the wider team.

## Security and retention

- Keep the `.env` file ignored and never commit its contents.
- Treat PDFs, recipient addresses, and mailbox contents as client data.
- Keep Storage private and use signed URLs only.
- Rotate a credential immediately if it appears in source, browser bundles, commits, screenshots, or shared logs.
- Add a retention/deletion policy before the mailbox grows significantly.

`GIVEAWAY_README.md` contains the deeper giveaway campaign and operating notes.
