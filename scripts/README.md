# Manual client email sender

This is the fallback/trusted-computer workflow. For sending from a phone, use the live portal at `https://insteltech.co.zw/mail/` instead.

`send-client-email.mjs` runs in a local Node.js 18+ terminal, reads a PDF from that computer, and calls Resend directly. It is not a Supabase Edge Function and does not read Supabase’s deployed secrets automatically.

The fixed sender is:

```text
InstelTech Marketing <marketing@insteltech.co.zw>
```

Set the key in the same terminal session without committing it:

```bash
read -r -s RESEND_API_KEY
export RESEND_API_KEY
```

Validate first, without contacting Resend:

```bash
node scripts/send-client-email.mjs \
  --dry-run \
  --to client@example.com \
  --pdf "/absolute/path/to/document.pdf" \
  --subject "Your InstelTech document" \
  --message $'Dear Team,\n\nPlease find your document attached.\n\nKind regards,\n\nInstel Technologies'
```

Then remove `--dry-run` for the live send. Multiple recipients can be comma-separated, and `--reply-to` is optional. Use an absolute PDF path when unsure of the current directory.

Never put `RESEND_API_KEY` in browser code, `env-config.js`, README files, screenshots, or shared logs. The `insteltech.co.zw` domain must be verified in Resend for the From address to be accepted.
