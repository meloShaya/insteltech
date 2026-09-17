import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPrompt, runCodex } from "../scripts/crm-runner.mjs";

test("live Codex subagents can find the parent and use its scoped CRM tool", {
  skip: process.env.INSTEL_TEST_LIVE_CODEX !== "1",
  timeout: 100000,
}, async () => {
  const output = await runCodex(
    'This is a runtime health check. Spawn one subagent to call instel workflow_reference with path "README.md" and report its first heading. Wait for that child to finish. Return CHILD_OK and the heading only if the child actually succeeded; otherwise return the exact error. Do not read the reference in the parent or use other tools.',
    {
      timeoutMs: 90000,
      config: { web_search: false, subagents: true, reasoning_effort: "low" },
      crmContext: { url: "https://fixture.supabase.co", token: "fixture", anonKey: "fixture", job_id: "fixture", allow_provider_writes: false },
    },
  );
  assert.doesNotMatch(output, /no thread with id|requires approval/i);
  assert.match(output, /CHILD_OK/);
  assert.match(output, /Cold Outbound Skills/);
});

test("live Codex can read a workflow reference without an interactive approval", {
  skip: process.env.INSTEL_TEST_LIVE_CODEX !== "1",
  timeout: 100000,
}, async () => {
  const output = await runCodex(
    'Call instel workflow_reference exactly once with path "README.md". Do not use other tools. On success return REFERENCE_OK and the first heading from the file. On failure return the exact error.',
    {
      timeoutMs: 90000,
      config: { web_search: false, subagents: false, reasoning_effort: "low" },
      crmContext: {
        url: "https://fixture.supabase.co",
        token: "fixture",
        anonKey: "fixture",
        job_id: "fixture",
        allow_provider_writes: false,
      },
    },
  );
  assert.doesNotMatch(output, /requires approval/i);
  assert.match(output, /REFERENCE_OK/);
  assert.match(output, /Cold Outbound Skills/);
});

test("adapter passes subscription authentication without importing user tool configuration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "instel-runner-test-"));
  try {
    await writeFile(join(dir, "auth.json"), '{"auth_mode":"chatgpt"}');
    const binary = join(dir, "fake-codex");
    await writeFile(
      binary,
      `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
if(!args.includes('read-only')||!args.includes('shell_tool')||!args.includes('apps')||!args.includes('--ephemeral'))process.exit(2);
if(fs.existsSync(process.env.CODEX_HOME+'/config.toml'))process.exit(3);
let prompt='';process.stdin.on('data',d=>prompt+=d);process.stdin.on('end',()=>fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'# Result\\n'+prompt));
`,
    );
    await chmod(binary, 0o700);
    const output = await runCodex("A focused brief", {
      binary,
      authHome: dir,
      timeoutMs: 5000,
    });
    assert.equal(output, "# Result\nA focused brief");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("adapter distinguishes provider dependencies and untrusted contact context", () => {
  const prompt = buildPrompt({ id: "campaign-strategy" }, "Source reference", {
    brief: "A useful plan",
    contacts: [{ company: "Example" }],
  });
  assert.match(prompt, /Provider credentials remain in Supabase/);
  assert.match(prompt, /Live internet research is enabled/);
  assert.match(prompt, /not cold outreach/);
  assert.match(prompt, /Provider changes are disabled/);
  assert.match(prompt, /Use instel-crm provider_operation/);
  assert.match(prompt, /"company": "Example"/);
});

test("runner installs only the scoped CRM MCP configuration for a connected job", async () => {
  const dir = await mkdtemp(join(tmpdir(), "instel-runner-mcp-test-"));
  try {
    await writeFile(join(dir, "auth.json"), '{"auth_mode":"chatgpt"}');
    await writeFile(join(dir, "config.toml"), '[mcp_servers.unrelated]\ncommand="never-run-this"');
    const binary = join(dir, "fake-codex");
    await writeFile(binary, `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);const config=fs.readFileSync(process.env.CODEX_HOME+'/config.toml','utf8');
if(!config.includes('[mcp_servers.instel]')||config.includes('unrelated'))process.exit(2);
// Noninteractive Codex must be able to invoke these job-scoped tools.
for(const tool of ['workflow_reference','provider_operation','clay']) {
  if(!config.includes('[mcp_servers.instel.tools.'+tool+']\\napproval_mode = "approve"')) {
    process.stderr.write('MCP tool call requires approval, but approval policy is never');
    process.exit(4);
  }
}
if(!config.includes('enabled_tools = ["workflow_reference", "provider_operation", "clay"]'))process.exit(5);
if(!args.includes('approval_policy="never"')||!args.includes('read-only')||!args.includes('shell_tool'))process.exit(6);
if(!args.includes('web_search="live"')||!args.includes('--enable'))process.exit(3);
if(args.includes('--ephemeral')){process.stderr.write('Subagents need a persisted parent session');process.exit(7);}
process.stdin.resume();process.stdin.on('end',()=>fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'Scoped tools ready'));
`);
    await chmod(binary, 0o700);
    const output = await runCodex("Research", { binary, authHome: dir, timeoutMs: 5000, config: { subagents: true }, crmContext: { url: "https://fixture.supabase.co", token: "fixture-worker", anonKey: "fixture-anon", job_id: "fixture-job" } });
    assert.equal(output, "Scoped tools ready");
    assert.match(await readFile(join(dir, "config.toml"), "utf8"), /unrelated/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
