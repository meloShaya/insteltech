# Manual client email sender

This is the fallback/trusted-computer workflow. For sending from a phone, use the live portal at `https://insteltech.co.zw/mail/` instead.

`send-client-email.mjs` runs in a local Node.js 18+ terminal and calls Resend directly. It is not a Supabase Edge Function and does not read Supabase’s deployed secrets automatically.

Every message is sent as:

```text
InstelTech Marketing <marketing@insteltech.co.zw>
```

Set the key in the same terminal session without committing it:

```bash
read -r -s RESEND_API_KEY
export RESEND_API_KEY
```

Attachments are optional. Supported formats are PDF, Word, Excel, CSV, text, RTF, PowerPoint, OpenDocument, JPG, JPEG, and PNG. Use `--attachment` once per file, with a 25 MB combined limit. The older `--pdf` flag remains available as an alias.

Validate a message with a PDF before contacting Resend:

```bash
node scripts/send-client-email.mjs \
  --dry-run \
  --to client@example.com \
  --attachment "/absolute/path/to/document.pdf" \
  --subject "Your InstelTech document" \
  --message $'Dear Team,\n\nPlease find your document attached.\n\nKind regards,\n\nInstel Technologies'
```

Send without an attachment by omitting `--attachment` entirely:

```bash
node scripts/send-client-email.mjs \
  --to client@example.com \
  --subject "A quick update" \
  --message $'Dear Team,\n\nHere is the requested update.\n\nKind regards,\n\nInstel Technologies'
```

Remove `--dry-run` for the live send. Multiple recipients can be comma-separated, and `--reply-to` is optional. Use absolute paths when unsure of the current directory.

Never put `RESEND_API_KEY` in browser code, `env-config.js`, README files, screenshots, or shared logs. The `insteltech.co.zw` domain must be verified in Resend for the sender address to be accepted.
