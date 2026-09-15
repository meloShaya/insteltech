import { AUTOMATIONS } from "./automation-catalog.mjs";
import { escapeHTML as e, prepareContacts } from "./domain.mjs";
import { sequenceConfig, campaignPlan } from "./campaign-sequences.mjs";

const button = (label, action, id = "") =>
  `<button type="button" class="button" data-action="automation-${action}" data-id="${e(id)}">${e(label)}</button>`;
export function providerMetricsPanel(campaigns) {
  const list = campaigns.filter((c) => c.provider && c.provider !== "resend");
  if (!list.length) return "";
  return `<section class="panel automation-panel"><div class="panel-head"><div><h2>Connected outbound campaigns</h2><p>Provider-reported totals. A dash means the provider has not supplied that metric.</p></div></div><div class="table-wrap"><table><thead><tr><th>CAMPAIGN</th><th>PROVIDER</th><th>SENT</th><th>REPLIES</th><th>POSITIVE</th><th>LAST SYNC</th><th></th></tr></thead><tbody>${list.map((c) => `<tr><td>${e(c.name)}</td><td>${e(c.provider)}</td><td>${e(c.provider_metrics?.sent ?? "—")}</td><td>${e(c.provider_metrics?.replies ?? "—")}</td><td>${e(c.provider_metrics?.positive ?? "—")}</td><td>${c.provider_synced_at ? e(new Date(c.provider_synced_at).toLocaleString()) : "Not synced"}</td><td>${button("Sync analytics", "sync-campaign", c.id)}</td></tr>`).join("")}</tbody></table></div></section>`;
}
export function automationPanel() {
  return `<section class="panel automation-panel"><div class="panel-head"><div><p class="eyebrow">FROM SEARCH TO ACTION</p><h2>Your automation desk</h2><p>Discover prospects, research companies and run your connected providers.</p></div>${button("Execution history", "history")}</div><div class="automation-shortcuts">${[
    [
      "⌕",
      "Google Maps",
      "Local businesses, websites and phone numbers",
      "maps.search",
    ],
    ["in", "LinkedIn", "LinkedIn profile research", "linkedin.person"],
    [
      "↗",
      "Internet research",
      "Live sources and website evidence",
      "web.search",
    ],
    [
      "✓",
      "Email verification",
      "Check deliverability with MillionVerifier",
      "millionverifier.verify",
    ],
  ]
    .map(
      ([icon, title, copy, id]) =>
        `<button class="automation-shortcut" data-action="automation-new" data-id="${id}"><span class="workflow-icon">${icon}</span><strong>${title}</strong><span>${copy}</span></button>`,
    )
    .join(
      "",
    )}</div><div class="panel-body actions">${button("Market expansion", "new", "market.expand")}${button("Schedule a workflow", "new", "crm.queue_workflow")}${button("All provider actions", "choose")}${button("Connections & scheduler", "connections")}</div></section>`;
}
export function createAutomationUI({
  state,
  modal,
  close,
  toast,
  load,
  save,
  submit,
  field,
  select,
  action,
}) {
  let runs = [],
    steps = [],
    displayedResult = null,
    sequenceDraft = null,
    schedules = [];
  const invoke = async (action, data = {}) => {
    if (state.demo)
      throw new Error(
        "Connect a live workspace to execute providers. Demo mode never calls paid APIs.",
      );
    const result = await state.db.functions.invoke("crm-automation", {
      body: { action, ...data },
    });
    if (result.error) {
      let message;
      try {
        message = (await result.error.context.json()).error;
      } catch {}
      throw new Error(message || result.error.message);
    }
    if (result.data?.error) throw new Error(result.data.error);
    return result.data;
  };
  const operationFields = (op) =>
    op.fields
      .map((f) => {
        if (f.key === "workflow_id")
          return select(
            f.label,
            f.key,
            state.catalog.map((w) => [w.id, w.title]),
            state.catalog[0]?.id,
          );
        if (f.type === "checkbox")
          return `<label class="check-label"><input name="${e(f.key)}" type="checkbox" ${f.value ? "checked" : ""}>${e(f.label)}</label>`;
        if (["textarea", "json"].includes(f.type))
          return `<label>${e(f.label)}<textarea name="${e(f.key)}" ${f.required ? "required" : ""} rows="5">${e(f.value)}</textarea></label>`;
        return field(
          f.label,
          f.key,
          f.value,
          f.type,
          `${f.required ? "required" : ""} ${f.type === "number" ? 'min="0" max="1000000"' : 'maxlength="2000"'}`,
        );
      })
      .join("");
  function newOperation(id) {
    const op = AUTOMATIONS.find((o) => o.id === id);
    if (!op) throw new Error("Choose a provider operation.");
    modal(
      op.title,
      `<p class="help">${op.write ? "This operation changes your connected provider account. Review the inputs before queuing." : "Results are saved to execution history for review and export."}</p><form class="automation-form">${operationFields(op)}<div class="form-grid">${field("Start at (leave blank for now)", "due_at", "", "datetime-local")}${field("Maximum attempts", "max_attempts", 3, "number", 'min="1" max="6" required')}</div><details><summary>Repeat automatically</summary><label class="check-label"><input type="checkbox" name="recurring">Repeat on selected weekdays</label>${field("Recurring time zone", "repeat_timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Harare")}${field("Recurring start time", "repeat_time", "09:00", "time")}${field("Recurring weekdays (0 = Sunday)", "repeat_days", "1,2,3,4,5")}<p class="help">Recurring mode uses this weekly schedule. An unfinished previous run prevents overlapping paid work.</p></details><p class="help">Scheduled runs require the workspace scheduler. Uncertain writes are held for review, regardless of the retry limit.</p>${submit("Queue operation")}</form>`,
      async (f) => {
        const input = {};
        for (const definition of op.fields) {
          const value = f[definition.key];
          if (definition.type === "checkbox")
            input[definition.key] = value === "on";
          else if (definition.type === "number")
            input[definition.key] = Number(value);
          else if (definition.type === "json") {
            try {
              input[definition.key] = JSON.parse(value);
            } catch {
              throw new Error(`${definition.label} must be valid JSON.`);
            }
          } else if (value) input[definition.key] = value;
        }
        const run = {
          title: op.title,
          steps: [{ operation: id, input }],
          max_attempts: Number(f.max_attempts),
          ...(f.due_at ? { due_at: new Date(f.due_at).toISOString() } : {}),
        };
        if (f.recurring === "on")
          run.recurring = {
            timezone: f.repeat_timezone,
            time: f.repeat_time,
            days: f.repeat_days
              .split(",")
              .filter((v) => v.trim())
              .map((v) => Number(v.trim())),
          };
        if (state.demo) {
          const runId = crypto.randomUUID();
          runs.unshift({
            id: runId,
            title: op.title,
            status: "queued",
            created_at: new Date().toISOString(),
          });
          if (run.recurring)
            schedules.unshift({
              id: runId,
              title: op.title,
              active: true,
              timezone: run.recurring.timezone,
              time_of_day: run.recurring.time,
              next_run_at: new Date().toISOString(),
            });
          steps.unshift({
            id: crypto.randomUUID(),
            run_id: runId,
            position: 0,
            operation: id,
            input,
            status: "queued",
            attempts: 0,
          });
          toast("Demo job queued. No provider request was made.");
        } else {
          await invoke("queue", run);
          toast(
            "Operation queued. Open the run to execute now, or let the scheduler pick it up.",
          );
        }
        await history();
      },
    );
  }
  async function history() {
    if (!state.demo) {
      const result = await state.db
        .from("crm_automation_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw new Error(result.error.message);
      runs = result.data;
    }
    modal(
      "Execution history",
      `<p class="help">The latest 100 runs. Every step keeps its own result, attempts and execution time.</p>${button("Recurring schedules", "schedules")}<div class="table-wrap"><table><thead><tr><th>RUN</th><th>STATUS</th><th>CREATED</th><th></th></tr></thead><tbody>${runs.map((run) => `<tr><td><strong>${e(run.title)}</strong></td><td><span class="badge ${e(run.status)}">${e(run.status)}</span></td><td>${e(new Date(run.created_at).toLocaleString())}</td><td>${button("Open", "run-detail", run.id)}</td></tr>`).join("")}</tbody></table></div>${!runs.length ? '<p class="notice">Your first automation starts here. Choose Google Maps, LinkedIn or any connected provider.</p>' : ""}`,
    );
  }
  async function detail(id) {
    let run = runs.find((r) => r.id === id);
    if (!state.demo) {
      const [a, b] = await Promise.all([
        state.db.from("crm_automation_runs").select("*").eq("id", id).single(),
        state.db
          .from("crm_automation_steps")
          .select("*")
          .eq("run_id", id)
          .order("position"),
      ]);
      if (a.error || b.error)
        throw new Error(a.error?.message || b.error.message);
      run = a.data;
      steps = b.data;
    }
    if (!run) throw new Error("Run not found.");
    const items = steps.filter((s) => s.run_id === id);
    modal(
      run.title,
      `<div class="actions"><span class="badge ${e(run.status)}">${e(run.status)}</span>${["queued", "running"].includes(run.status) ? button("Run next step now", "execute", id) : ""}${run.status === "failed" ? button("Retry failed step", "retry", id) : ""}${!["completed", "cancelled"].includes(run.status) ? button("Cancel remaining steps", "cancel", id) : ""}${button("Refresh", "run-detail", id)}</div>${run.status === "held" ? '<p class="notice">A provider write may have succeeded. Check the provider account before taking another action. Automatic retries are stopped to avoid duplicates.</p>' : ""}<div class="automation-step-list">${items.map((s) => `<section class="automation-step"><div><span class="routine-number">${s.position + 1}</span><h3>${e(AUTOMATIONS.find((o) => o.id === s.operation)?.title || s.operation)}</h3><span class="badge ${e(s.status)}">${e(s.status)}</span></div><p class="help">${s.attempts} attempt(s)${s.due_at ? ` · Due ${e(new Date(s.due_at).toLocaleString())}` : ""}</p>${s.error ? `<p class="notice">${e(s.error)}</p>` : ""}${s.status === "held" ? button("Reconcile provider outcome", "reconcile", s.id) : ""}${s.output ? button("View results", "results", s.id) : ""}</section>`).join("")}</div>`,
    );
  }
  function results(id) {
    const step = steps.find((s) => s.id === id);
    if (!step?.output) throw new Error("This step has no saved result yet.");
    displayedResult = step.output;
    const records = step.output.records || [],
      keys = [
        ...new Set(records.slice(0, 100).flatMap((r) => Object.keys(r || {}))),
      ].slice(0, 7);
    const cell = (value) =>
      value && typeof value === "object"
        ? JSON.stringify(value)
        : String(value ?? "");
    modal(
      "Provider results",
      `<p class="help">${records.length} record(s) · ${e(step.output.source)} · ${e(step.output.fetched_at)}</p><div class="actions">${button("Download JSON", "download")}${button("Import email contacts", "import")}</div><div class="table-wrap automation-results"><table><thead><tr>${keys.map((k) => `<th>${e(k.replaceAll("_", " "))}</th>`).join("")}</tr></thead><tbody>${records
        .slice(0, 100)
        .map(
          (r) =>
            `<tr>${keys.map((k) => `<td>${e(cell(r[k]).slice(0, 2000))}</td>`).join("")}</tr>`,
        )
        .join(
          "",
        )}</tbody></table></div><details><summary>Complete provider response</summary><pre class="artifact">${e(JSON.stringify(step.output.data, null, 2))}</pre></details>`,
    );
  }
  async function connections() {
    const result = state.demo
      ? {
          connections: (
            await import("./automation-catalog.mjs")
          ).CONNECTIONS.map((c) => ({
            ...c,
            connected: false,
            missing: c.secrets,
          })),
          scheduler: false,
        }
      : await invoke("connections");
    modal(
      "Connections & scheduler",
      `<p class="help">Add API keys to Supabase → Edge Functions → Secrets after setup. This dashboard displays connection readiness without exposing keys.</p>${result.connections.map((c) => `<div class="setting-row"><div><h3>${e(c.name)}</h3><p>${e(c.connected ? "Required secrets are present. Run an operation to test account access." : c.missing.join(", "))}</p></div><span class="badge ${c.connected ? "qualified" : "queued"}">${c.connected ? "Configured" : "Key needed"}</span></div>`).join("")}<div class="setting-row"><div><h3>Background execution</h3><p>Supabase checks for due provider operations every minute.</p></div>${button(result.scheduler ? "Disable scheduler" : "Enable scheduler", "scheduler", result.scheduler ? "off" : "on")}</div>`,
    );
  }
  async function recurringSchedules() {
    if (!state.demo) {
      const result = await state.db
        .from("crm_automation_schedules")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw new Error(result.error.message);
      schedules = result.data;
    }
    modal(
      "Recurring schedules",
      `<p class="help">Scheduled work runs in Supabase. An offline browser does not interrupt it.</p>${schedules.map((s) => `<div class="setting-row"><div><h3>${e(s.title)}</h3><p>${e(s.time_of_day)} · ${e(s.timezone)}<br>Next: ${e(new Date(s.next_run_at).toLocaleString())}</p></div>${s.active ? button("Pause schedule", "pause-schedule", s.id) : '<span class="badge">Paused</span>'}</div>`).join("") || '<p class="notice">Enable Repeat automatically when configuring a provider operation.</p>'}`,
    );
  }
  async function deliveries(id) {
    const initial = state.data.recipients
      .filter((r) => r.campaign_id === id)
      .map((r) => ({ ...r, step: 1 }));
    let following = [];
    if (!state.demo) {
      const result = await state.db
        .from("crm_followups")
        .select("*")
        .eq("campaign_id", id)
        .order("due_at")
        .limit(1000);
      if (result.error) throw new Error(result.error.message);
      following = result.data.map((r) => ({ ...r, step: r.step_index + 2 }));
    }
    modal(
      "Sequence delivery history",
      `<div class="actions">${button("Refresh", "deliveries", id)}${button("Reconcile held deliveries", "reconcile-deliveries", id)}${button("Retry known failures", "retry-deliveries", id)}</div><p class="help">First messages and the next 1,000 follow-ups. Held deliveries are matched to mailbox records; they are never blindly resent.</p><div class="table-wrap"><table><thead><tr><th>CONTACT</th><th>STEP</th><th>STATUS</th><th>DUE / SENT</th><th>DETAIL</th></tr></thead><tbody>${[...initial, ...following].map((r) => `<tr><td>${e(state.data.contacts.find((c) => c.id === r.contact_id)?.email || "Deleted contact")}</td><td>${r.step}</td><td><span class="badge ${e(r.status)}">${e(r.status)}</span></td><td>${e(r.sent_at || r.due_at || r.created_at || "")}</td><td>${e(r.error || "")}</td></tr>`).join("")}</tbody></table></div>`,
    );
  }
  function codexSettings() {
    const s = {
      web_search: true,
      subagents: false,
      model: "",
      reasoning_effort: "high",
      agent_model: "",
      agent_reasoning_effort: "high",
      max_agents: 3,
      ...state.data.settings.codex_config,
    };
    modal(
      "Codex execution settings",
      `<form><p class="help">Uses the paired computer's ChatGPT/Codex subscription. Changes apply to newly queued jobs.</p><label class="check-label"><input type="checkbox" name="web_search" ${s.web_search ? "checked" : ""}>Enable live internet research</label><label class="check-label"><input type="checkbox" name="subagents" ${s.subagents ? "checked" : ""}>Enable Codex sub-agents</label>${field("Main model (blank uses Codex default)", "model", s.model)}${select(
        "Main reasoning effort",
        "reasoning_effort",
        ["low", "medium", "high", "xhigh"].map((v) => [v, v]),
        s.reasoning_effort,
      )}${field("Sub-agent model (for example gpt-5.6-luna)", "agent_model", s.agent_model)}${select(
        "Sub-agent reasoning effort",
        "agent_reasoning_effort",
        ["low", "medium", "high", "xhigh"].map((v) => [v, v]),
        s.agent_reasoning_effort,
      )}${field("Job timeout (minutes)", "timeout_minutes", s.timeout_minutes || 60, "number", 'min="1" max="180" required')}${field("Maximum concurrent agents", "max_agents", s.max_agents, "number", 'min="1" max="6" required')}<p class="help">Model names must be available to your Codex account. An unavailable model produces an explicit job error; the runner will not silently substitute another model.</p>${submit()}</form>`,
      async (f) => {
        await save(
          "settings",
          {
            codex_config: {
              web_search: f.web_search === "on",
              subagents: f.subagents === "on",
              model: f.model.trim(),
              reasoning_effort: f.reasoning_effort,
              agent_model: f.agent_model.trim(),
              agent_reasoning_effort: f.agent_reasoning_effort,
              max_agents: Number(f.max_agents),
              timeout_minutes: Number(f.timeout_minutes),
            },
          },
          true,
        );
        close();
        await load();
        toast("Codex settings saved.");
      },
    );
  }
  function captureSequence() {
    const form = document.querySelector("#dialog-body form");
    if (!form || !sequenceDraft) return;
    const f = Object.fromEntries(new FormData(form));
    sequenceDraft.provider = f.provider;
    sequenceDraft.sequence = sequenceDraft.sequence.map((_, i) => ({
      subject: f[`subject_${i}`],
      body: f[`body_${i}`],
      delay_days: Number(f[`delay_${i}`]),
    }));
    sequenceDraft.sending_config = {
      timezone: f.timezone,
      days: [...form.querySelectorAll('[name="days"]:checked')].map((el) =>
        Number(el.value),
      ),
      start_hour: f.start_hour,
      end_hour: f.end_hour,
      daily_limit: Number(f.daily_limit),
      interval_minutes: Number(f.interval_minutes),
      max_attempts: Number(f.max_attempts),
      sender_ids: f.sender_ids,
      autonomous: f.autonomous === "on",
      stop_on_reply: f.stop_on_reply === "on",
      launch_at: f.launch_at ? new Date(f.launch_at).toISOString() : "",
    };
  }
  function sequenceEditor(id, preserve = false) {
    const campaign = state.data.campaigns.find((c) => c.id === id);
    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.status === "active")
      throw new Error("Pause the campaign before editing its sequence.");
    if (!preserve)
      sequenceDraft = structuredClone({
        ...campaign,
        sequence: campaign.sequence || [],
      });
    const s = {
      timezone: "Africa/Harare",
      days: [1, 2, 3, 4, 5],
      start_hour: "09:00",
      end_hour: "17:00",
      daily_limit: 30,
      interval_minutes: 5,
      sender_ids: "",
      stop_on_reply: true,
      autonomous: false,
      ...sequenceDraft.sending_config,
    };
    const localTime = s.launch_at
      ? new Date(
          new Date(s.launch_at).getTime() -
            new Date(s.launch_at).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
    modal(
      "Sequence & sending schedule",
      `<form class="automation-form">${select(
        "Sending provider",
        "provider",
        [
          ["resend", "Resend · permission-based mailbox"],
          ["smartlead", "Smartlead · outbound sequences"],
          ["instantly", "Instantly · outbound sequences"],
        ],
        sequenceDraft.provider || "resend",
      )}<section class="automation-step"><h3>01 · First message</h3><p>${e(campaign.subject)}</p><p class="help">Edit the first message using Edit copy.</p></section>${sequenceDraft.sequence.map((step, i) => `<section class="automation-step"><div><h3>${String(i + 2).padStart(2, "0")} · Follow-up</h3>${button("Remove", "remove-step", String(i))}</div>${field("Days after the previous email", `delay_${i}`, step.delay_days, "number", 'min="1" max="365" required')}${field("Subject", `subject_${i}`, step.subject, "text", 'required maxlength="200"')}<label>Email body<textarea name="body_${i}" rows="5" required maxlength="50000">${e(step.body)}</textarea></label></section>`).join("")}${button("Add a follow-up", "add-step", id)}<div class="form-grid">${field("Time zone", "timezone", s.timezone, "text", 'required placeholder="Africa/Harare"')}${field("Daily new-lead limit", "daily_limit", s.daily_limit, "number", 'min="1" max="1000" required')}${field("Send from", "start_hour", s.start_hour, "time", "required")}${field("Send until", "end_hour", s.end_hour, "time", "required")}${field("Maximum delivery attempts", "max_attempts", s.max_attempts || 1, "number", 'min="1" max="6" required')}${field("Minutes between emails (Smartlead / Resend)", "interval_minutes", s.interval_minutes, "number", 'min="1" max="1440" required')}${field("Start publishing at (optional, your local time)", "launch_at", localTime, "datetime-local")}</div><label>Sending days</label><div class="actions">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name, i) => `<label class="check-label"><input type="checkbox" name="days" value="${i}" ${s.days.includes(i) ? "checked" : ""}>${name}</label>`).join("")}</div>${field("Sender IDs (Smartlead) or sender emails (Instantly), comma separated", "sender_ids", s.sender_ids)}<label class="check-label"><input type="checkbox" name="stop_on_reply" ${s.stop_on_reply ? "checked" : ""}>Stop follow-ups when someone replies</label><label class="check-label"><input type="checkbox" name="autonomous" ${s.autonomous ? "checked" : ""}>Enable automatic daily sending after activation</label><p class="help">Provider sequences follow their daily schedule without an open browser. Future publishing requires the Supabase scheduler. Sender accounts must already exist in the selected provider.</p>${submit("Save sequence")}</form>`,
      async () => {
        captureSequence();
        if (
          campaign.provider_campaign_id &&
          sequenceDraft.provider !== campaign.provider
        )
          throw new Error(
            "Create a separate campaign to change an already connected provider.",
          );
        sequenceConfig(sequenceDraft);
        await save(
          "campaigns",
          {
            provider: sequenceDraft.provider,
            sequence: sequenceDraft.sequence,
            sending_config: sequenceDraft.sending_config,
          },
          id,
        );
        close();
        await load();
        toast(
          "Sequence and schedule saved. Publish the campaign when your audience is ready.",
        );
      },
    );
  }
  async function handle(key, id) {
    if (["activate-campaign", "pause-campaign"].includes(key)) {
      const campaign = state.data.campaigns.find((c) => c.id === id);
      if (campaign?.provider && campaign.provider !== "resend") {
        modal(
          key === "activate-campaign"
            ? "Activate provider campaign"
            : "Pause provider campaign",
          `<p class="notice">This will ${key === "activate-campaign" ? "start sending according to your configured daily window" : "pause sending"} in ${e(campaign.provider)}.</p><form>${submit("Queue provider change")}</form>`,
          async () => {
            await invoke("campaign_status", {
              id,
              status: key === "activate-campaign" ? "active" : "paused",
            });
            await history();
          },
        );
        return true;
      }
    }
    if (!key.startsWith("automation-")) return false;
    switch (key.slice(11)) {
      case "new":
        newOperation(id);
        break;
      case "choose": {
        modal(
          "Choose a provider action",
          `<div class="form-grid"><label>Find an action<input id="operation-search" type="search" placeholder="Search campaigns, scraping, warmup…"></label><label>Provider<select id="operation-provider"><option value="">All providers</option>${[...new Set(AUTOMATIONS.map((op) => op.provider))].map((provider) => `<option value="${e(provider)}">${e(provider.toUpperCase())}</option>`).join("")}</select></label></div><div class="automation-operation-list">${AUTOMATIONS.map((op) => `<div class="setting-row" data-operation-row data-provider="${e(op.provider)}" data-search="${e((op.title + " " + op.provider + " " + op.id).toLowerCase())}"><div><h3>${e(op.title)}</h3><p>${e(op.provider)} · ${op.write ? "Changes data or provider state" : "Research / read"}</p></div>${button("Configure", "new", op.id)}</div>`).join("")}</div>`,
        );
        const filter = () => {
          const query = document
            .querySelector("#operation-search")
            .value.toLowerCase();
          const provider = document.querySelector("#operation-provider").value;
          document.querySelectorAll("[data-operation-row]").forEach((row) => {
            row.style.display =
              (!provider || row.dataset.provider === provider) &&
              row.dataset.search.includes(query)
                ? ""
                : "none";
          });
        };
        document.querySelector("#operation-search").oninput = filter;
        document.querySelector("#operation-provider").onchange = filter;
        break;
      }
      case "history":
        await history();
        break;
      case "sync-campaign":
        await invoke("queue", {
          title: "Sync campaign analytics",
          steps: [
            { operation: "crm.sync_campaign", input: { campaign_id: id } },
          ],
        });
        await history();
        break;
      case "schedules":
        await recurringSchedules();
        break;
      case "pause-schedule":
        if (state.demo) schedules.find((s) => s.id === id).active = false;
        else await invoke("pause_schedule", { id });
        await recurringSchedules();
        break;
      case "run-detail":
        await detail(id);
        break;
      case "execute":
        await invoke("run", { id });
        await detail(id);
        break;
      case "retry":
        await invoke("retry", { id });
        await detail(id);
        break;
      case "cancel":
        await invoke("cancel", { id });
        await detail(id);
        break;
      case "results":
        results(id);
        break;
      case "reconcile": {
        const step = steps.find((s) => s.id === id);
        modal(
          "Reconcile provider outcome",
          `<p class="notice">First check the provider account for this exact operation. A mistaken retry can create duplicate campaigns or sends.</p><form>${select(
            "Verified outcome",
            "executed",
            [
              ["yes", "The operation completed in the provider"],
              ["no", "The provider confirms it did not execute"],
            ],
            "yes",
          )}<label>Provider result (JSON, include id for created objects)<textarea name="result" rows="4">{}</textarea></label><label>Verification evidence<textarea name="note" minlength="20" required placeholder="Provider record URL, ID, time, and what you checked"></textarea></label><label class="check-label"><input type="checkbox" required>I checked the provider outcome before choosing this resolution.</label>${submit("Save verified outcome")}</form>`,
          async (f) => {
            let result;
            try {
              result = JSON.parse(f.result);
            } catch {
              throw new Error(
                "Enter valid JSON for the verified provider result.",
              );
            }
            await invoke("reconcile", {
              step_id: id,
              executed: f.executed === "yes",
              result,
              note: f.note,
            });
            await detail(step.run_id);
          },
        );
        break;
      }
      case "connections":
        await connections();
        break;
      case "scheduler":
        await invoke("scheduler", { enabled: id === "on" });
        await connections();
        break;
      case "codex":
        codexSettings();
        break;
      case "sequence":
        sequenceEditor(id);
        break;
      case "deliveries":
        await deliveries(id);
        break;
      case "retry-deliveries":
        await action("retry_deliveries", { campaign_id: id });
        await load(false);
        await deliveries(id);
        break;
      case "reconcile-deliveries":
        await action("reconcile_sends", { campaign_id: id });
        await load(false);
        await deliveries(id);
        break;
      case "add-step":
        captureSequence();
        if (sequenceDraft.sequence.length >= 19)
          throw new Error("Maximum 20 sequence steps.");
        sequenceDraft.sequence.push({
          subject: sequenceDraft.subject,
          body: "Hi {{first_name}},\n\nFollowing up on my earlier message.\n",
          delay_days: 3,
        });
        sequenceEditor(sequenceDraft.id, true);
        break;
      case "remove-step":
        captureSequence();
        sequenceDraft.sequence.splice(Number(id), 1);
        sequenceEditor(sequenceDraft.id, true);
        break;
      case "publish": {
        const campaign = state.data.campaigns.find((c) => c.id === id);
        const ids = new Set(
          state.data.recipients
            .filter((r) => r.campaign_id === id)
            .map((r) => r.contact_id),
        );
        const contacts = state.data.contacts.filter((c) => ids.has(c.id));
        const plan = campaignPlan(campaign, contacts, state.data.settings);
        modal(
          "Review provider publishing",
          `<p class="notice">${e(campaign.name)} · ${e(campaign.provider)} · ${contacts.length} contacts · ${(campaign.sequence || []).length + 1} messages.</p><p>${campaign.sending_config?.autonomous ? "The final step activates sending automatically within your configured daily window." : "The campaign stays inactive until you activate it."}</p><ol>${plan.map((step) => `<li>${e(AUTOMATIONS.find((op) => op.id === step.operation)?.title || step.operation)}</li>`).join("")}</ol><form>${submit("Publish campaign")}</form>`,
          async () => {
            await invoke("campaign_publish", { id });
            await history();
          },
        );
        break;
      }
      case "download": {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(displayedResult, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "instel-research-results.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case "import": {
        const records = (displayedResult?.records || []).filter(
          (r) => typeof r.email === "string" && r.email.includes("@"),
        );
        if (!records.length)
          throw new Error(
            "These results have no email addresses. Enrich the companies or profiles first.",
          );
        const prepared = prepareContacts(
          records.map((r) => ({ ...r, source: displayedResult.source })),
          state.data.contacts,
        );
        if (!prepared.contacts?.length)
          throw new Error("No new valid contacts to import.");
        modal(
          "Review contact import",
          `<p>${prepared.contacts.length} new contacts. Permission remains unrecorded. Existing contacts are preserved.</p><form>${submit("Import contacts")}</form>`,
          async () => {
            await save("contacts", prepared.contacts);
            close();
            await load();
            toast("Research contacts imported.");
          },
        );
        break;
      }
    }
    return true;
  }
  return { handle };
}
