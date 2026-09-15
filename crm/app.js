import { campaignDisplayMetrics } from "./campaign-sequences.mjs";
import {
  STAGES,
  LABELS,
  escapeHTML as e,
  parseCSV,
  prepareContacts,
  toCSV,
  scoreList,
  checkCopy,
  campaignMetrics,
  renderTemplate,
} from "./domain.mjs";
import { demoData } from "./demo.mjs";
import {
  automationPanel,
  createAutomationUI,
  providerMetricsPanel,
} from "./automations-ui.mjs";
import {
  SESSION_IDLE_TIMEOUT_MS,
  getSessionActivityAt,
  isSessionIdle,
} from "../mail/session-timeout.mjs";

const $ = (selector) => document.querySelector(selector);
const mobileNavigation = window.matchMedia("(max-width: 800px)");
function setMenu(open) {
  const expanded = mobileNavigation.matches && open;
  $("#sidebar").classList.toggle("open", expanded);
  $("#sidebar").inert = mobileNavigation.matches && !expanded;
  $("#menu").setAttribute("aria-expanded", String(expanded));
}
const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
const number = (n) => Number(n || 0).toLocaleString();
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "—";
const today = () => new Date().toISOString().slice(0, 10);
const nextMonday = () => {
  const day = new Date(`${today()}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((8 - day.getUTCDay()) % 7));
  return day.toISOString().slice(0, 10);
};
const initials = (c) =>
  (c.first_name?.[0] || c.company?.[0] || "?") + (c.last_name?.[0] || "");
const name = (c) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
const colors = [
  "#b8c5d3",
  "#b2cbbb",
  "#b5c5dd",
  "#d9c5a0",
  "#c5b9ce",
  "#82b39a",
  "#d5a5a0",
];
const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  contacts:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3a4 4 0 0 1 0 8",
  companies: "M4 21V5h10v16 M14 10h6v11 M2 21h20 M7 9h4 M7 13h4 M7 17h4",
  pipeline: "M4 4h4v16H4z M10 4h4v10h-4z M16 4h4v6h-4z",
  campaigns: "m3 11 18-8-8 18-2-8-8-2z M11 13l5-5",
  inbox: "M3 5h18v14H3z m0 1 9 7 9-7",
  workflows: "m12 3-8 10h7l-1 8 10-12h-8z",
  reports: "M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
};
const icon = (key, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key] || paths.workflows}"/></svg>`;
const titles = {
  overview: "Overview",
  contacts: "Contacts",
  companies: "Companies",
  pipeline: "Pipeline",
  campaigns: "Campaigns",
  inbox: "Inbox",
  workflows: "Workflows",
  reports: "Reports",
  settings: "Settings",
};
const state = {
  demo: false,
  db: null,
  session: null,
  data: null,
  catalog: [],
  route: "overview",
  filter: "all",
  search: "",
  page: 0,
  workflowGroup: "All",
  busy: false,
};
let toastTimer, pollTimer, mfaFactor;
let idleTimer,
  lastActivity = 0;
const activityKey = () =>
  `insteltech-mail:last-activity:${state.session?.user.id}`;
function recordActivity() {
  if (state.demo || !state.session || Date.now() - lastActivity < 5000) return;
  lastActivity = Date.now();
  try {
    localStorage.setItem(activityKey(), String(lastActivity));
  } catch {}
}
for (const event of ["pointerdown", "keydown", "scroll", "touchstart"])
  document.addEventListener(event, recordActivity, { passive: true });
window.addEventListener("storage", (event) => {
  if (event.key === activityKey() && Number(event.newValue) > lastActivity)
    lastActivity = Number(event.newValue);
});

function toast(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => ($("#toast").hidden = true),
    error ? 10000 : 5500,
  );
}
function modal(title, body, onSubmit) {
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = body;
  if (!$("#dialog").open) $("#dialog").showModal();
  const form = $("#dialog-body form");
  if (form && onSubmit)
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button =
        form.querySelector("[type=submit]") ||
        form.querySelector("button:not([type=button])");
      if (button?.disabled) return;
      if (button) button.disabled = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(form)), form);
      } catch (error) {
        toast(error.message, true);
      } finally {
        if (button) button.disabled = false;
      }
    };
}
const close = () => $("#dialog").close();
const field = (label, key, value = "", type = "text", extra = "") =>
  `<label>${e(label)}<input name="${key}" type="${type}" value="${e(value ?? "")}" ${extra}></label>`;
const area = (label, key, value = "", extra = "") =>
  `<label>${e(label)}<textarea name="${key}" ${extra}>${e(value)}</textarea></label>`;
const select = (label, key, options, value) =>
  `<label>${e(label)}<select name="${key}">${options.map(([v, text]) => `<option value="${e(v)}" ${v === value ? "selected" : ""}>${e(text)}</option>`).join("")}</select></label>`;
const submit = (text = "Save changes") =>
  `<div class="dialog-actions"><button type="button" class="button" data-action="close">Cancel</button><button type="submit" class="button primary">${text} ↗</button></div>`;
const badge = (value, label = value) =>
  `<span class="badge ${e(value)}">${e(label)}</span>`;
const empty = (title, copy, action = "") =>
  `<div class="empty"><div class="empty-icon">↗</div><h3>${e(title)}</h3><p>${e(copy)}</p>${action}</div>`;
const heading = (eyebrow, title, subtitle, actions = "") =>
  `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`;
const button = (text, action, id = "", primary = false) =>
  `<button class="button ${primary ? "primary" : ""}" data-action="${action}" data-id="${e(id)}">${text}</button>`;
const stat = (title, value, note, key) =>
  `<div class="stat"><div class="stat-label">${title}${icon(key)}</div><div class="stat-value">${value}</div><div class="stat-foot">${note}</div></div>`;
function download(filename, content, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function rows(table) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const fields =
      table === "workers" ? "id,name,active,last_seen_at,created_at" : "*";
    const { data, error } = await state.db
      .from(`crm_${table}`)
      .select(fields)
      .order(table === "settings" ? "id" : "created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...data);
    if (data.length < 1000) return all;
    if (all.length >= 50000)
      throw new Error(
        "This workspace exceeds the 50,000-row dashboard limit. Add server-side pagination before continuing.",
      );
  }
}
async function load(showLoading = true) {
  if (state.demo) {
    render();
    return;
  }
  if (showLoading)
    $("#content").innerHTML =
      '<div class="loading" role="status">Bringing your workspace together…</div>';
  const tables = [
    "contacts",
    "campaigns",
    "recipients",
    "followups",
    "jobs",
    "notes",
    "tasks",
    "experiments",
    "settings",
    "workers",
  ];
  const data = await Promise.all(tables.map(rows));
  state.data = Object.fromEntries(
    tables.map((t, i) => [t, t === "settings" ? data[i][0] || {} : data[i]]),
  );
  render();
}
async function save(table, payload, id) {
  if (state.demo) {
    if (table === "settings")
      state.data.settings = { ...state.data.settings, ...payload };
    else if (id) {
      const row = state.data[table].find((r) => r.id === id);
      if (!row) throw new Error("Record not found");
      Object.assign(row, payload, { updated_at: new Date().toISOString() });
    } else
      state.data[table].unshift(
        ...(Array.isArray(payload) ? payload : [payload]).map((p) => ({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...p,
        })),
      );
    persistDemo();
    return;
  }
  const query = state.db.from(`crm_${table}`);
  const { error } =
    id !== undefined
      ? await query.update(payload).eq("id", id)
      : await query.insert(payload);
  if (error) throw error;
}
function persistDemo() {
  try {
    sessionStorage.setItem("instel-crm-demo-v1", JSON.stringify(state.data));
  } catch {
    /* Demo remains usable without browser storage. */
  }
}
async function action(actionName, data = {}) {
  if (state.demo)
    throw new Error(
      "This action needs a live workspace. Demo mode never sends mail or runs AI.",
    );
  const { data: result, error } = await state.db.functions.invoke(
    "crm-action",
    { body: { action: actionName, ...data } },
  );
  if (error) {
    let detail;
    try {
      detail = (await error.context.json()).error;
    } catch {}
    throw new Error(detail || error.message);
  }
  if (result?.error) throw new Error(result.error);
  return result;
}
function filteredContacts() {
  return state.data.contacts.filter(
    (c) =>
      (state.filter === "all" || c.stage === state.filter) &&
      [name(c), c.email, c.company, c.title].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(state.search.toLowerCase()),
      ),
  );
}
function contactTable(contacts, compact = false) {
  return `<div class="table-wrap"><table><thead><tr><th>NAME</th><th>COMPANY</th><th>STAGE</th>${compact ? "<th>ADDED</th>" : "<th>PERMISSION</th><th>VALUE</th><th></th>"}</tr></thead><tbody>${contacts.map((c, i) => `<tr><td><button class="person row-link" data-action="contact" data-id="${e(c.id)}"><span class="avatar ${["rose", "green", "blue"][i % 3]}">${e(initials(c))}</span><span><strong>${e(name(c))}</strong><small>${e(c.email)}</small></span></button></td><td>${e(c.company || "—")}</td><td>${badge(c.stage, LABELS[c.stage])}</td>${compact ? `<td>${date(c.created_at)}</td>` : `<td>${badge(c.suppressed ? "suppressed" : c.consent ? "qualified" : "new", c.suppressed ? "Suppressed" : c.consent ? "Recorded" : "Not recorded")}</td><td>${money(c.value)}</td><td><button class="icon-button" data-action="edit-contact" data-id="${e(c.id)}" aria-label="Edit ${e(name(c))}">↗</button></td>`}</tr>`).join("")}</tbody></table></div>`;
}
function render() {
  if (!state.data) return;
  state.route = location.hash.slice(1).split("?")[0] || "overview";
  if (!titles[state.route]) state.route = "overview";
  $("#breadcrumb").textContent = titles[state.route];
  $("#main-nav").innerHTML = Object.entries(titles)
    .map(
      ([key, title], i) =>
        `${i === 6 || i === 8 ? '<div class="nav-divider"></div>' : ""}<a href="#${key}" class="nav-item ${state.route === key ? "active" : ""}" ${state.route === key ? 'aria-current="page"' : ""}>${icon(key)}${title}${key === "contacts" ? `<span class="nav-count">${number(state.data.contacts.length)}</span>` : key === "workflows" ? `<span class="nav-count">${state.catalog.length}</span>` : ""}</a>`,
    )
    .join("");
  $("#connection").innerHTML =
    `<i></i>${state.demo ? "Demo workspace" : "Live workspace"}`;
  const views = {
    overview,
    contacts,
    companies,
    pipeline,
    campaigns,
    inbox,
    workflows,
    reports,
    settings,
  };
  $("#content").innerHTML = views[state.route]();
  setMenu(false);
  const search = $("#table-search");
  if (search)
    search.addEventListener("input", (event) => {
      state.search = event.target.value;
      state.page = 0;
      const pos = event.target.selectionStart;
      render();
      $("#table-search")?.focus();
      $("#table-search")?.setSelectionRange(pos, pos);
    });
  const filter = $("#stage-filter");
  if (filter)
    filter.onchange = (event) => {
      state.filter = event.target.value;
      state.page = 0;
      render();
    };
}
function overview() {
  const d = state.data,
    metrics = campaignMetrics(d.recipients),
    active = d.contacts.filter((c) => !["won", "lost"].includes(c.stage));
  const stageRows = STAGES.slice(0, 6)
    .map((stage, i) => {
      const n = d.contacts.filter((c) => c.stage === stage).length;
      return `<div class="pipeline-row"><span class="pip" style="background:${colors[i]}"></span><span class="label">${LABELS[stage]}</span><span class="track"><i style="width:${d.contacts.length ? (n / d.contacts.length) * 100 : 0}%;background:${colors[i]}"></i></span><strong>${n}</strong></div>`;
    })
    .join("");
  const tasks = d.tasks
    .filter((t) => !t.completed)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .slice(0, 3);
  return (
    heading(
      "YOUR GROWTH, IN FOCUS",
      "Good things start with <em>a connection.</em>",
      "A clear view of your relationships, conversations, and what comes next.",
      button("＋ Add contact", "edit-contact", "", true),
    ) +
    `<div class="welcome-card"><div><p class="eyebrow">LESS SCATTER. MORE MOMENTUM.</p><h2>Your next opportunity is a conversation away.</h2><p>Find the right people. Make it personal. Keep every follow-up moving.</p></div><button class="button" data-action="run-workflow" data-id="cold-email-kickoff">Plan your next campaign <span>↗</span></button></div>` +
    `<div class="stats">${stat("Total contacts", number(d.contacts.length), `<strong>${d.contacts.filter((c) => c.stage === "qualified").length} qualified</strong> and ready to explore`, "contacts")}${stat("Open pipeline", money(active.reduce((s, c) => s + Number(c.value || 0), 0)), `${active.length} relationships in progress`, "pipeline")}${stat("Active campaigns", d.campaigns.filter((c) => c.status === "active").length, `${d.campaigns.filter((c) => c.status === "draft").length} drafts taking shape`, "campaigns")}${stat("Positive reply rate", metrics.positiveRate.toFixed(1) + "%", `<strong>${metrics.positive} positive</strong> / ${metrics.sent} sent`, "inbox")}</div>` +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>A little closer to yes</h2><p>Your relationships, from first hello to next chapter.</p></div><button class="text-button" data-go="pipeline">View pipeline ↗</button></div><div class="panel-body"><div class="pipeline-summary">${STAGES.map((s, i) => `<span style="background:${colors[i]};flex:${d.contacts.filter((c) => c.stage === s).length || 0.08}"></span>`).join("")}</div><div class="pipeline-list">${stageRows}</div></div></section><section class="panel"><div class="panel-head"><div><h2>Make room for the next move</h2><p>Small actions. Meaningful progress.</p></div>${button("＋", "new-task")}</div><div class="panel-body">${tasks.length ? tasks.map((t, i) => `<div class="routine"><span class="routine-number">0${i + 1}</span><div><strong>${e(t.title)}</strong><p>${date(t.due_at)} · ${t.due_at < today() ? "Overdue" : t.due_at === today() ? "Today" : "Coming up"}</p></div><button class="text-button" data-action="complete-task" data-id="${e(t.id)}" aria-label="Complete ${e(t.title)}">✓</button></div>`).join("") : '<div class="routine"><div><strong>A little breathing room.</strong><p>Add your next follow-up to keep the momentum going.</p></div></div>'}</div></section></div>` +
    `<section class="panel"><div class="panel-head"><div><h2>The newest faces in your network</h2><p>Every great partnership starts somewhere.</p></div><button class="text-button" data-go="contacts">All contacts ↗</button></div>${d.contacts.length ? contactTable(d.contacts.slice(0, 5), true) : empty("Your next chapter starts here", "Add your first contact or import a list to start building your pipeline.", button("Import contacts", "import"))}<div class="table-foot"><span>${Math.min(5, d.contacts.length)} of ${number(d.contacts.length)} contacts</span><span>MADE FOR MEANINGFUL FOLLOW-THROUGH ↗</span></div></section>`
  );
}
function contacts() {
  const list = filteredContacts(),
    page = list.slice(state.page * 25, state.page * 25 + 25);
  return (
    heading(
      "PEOPLE BEFORE PIPELINES",
      "Your people. <em>All in one place.</em>",
      "A little context makes every conversation better.",
      button("↓ Export", "export") +
        button("↑ Import CSV", "import") +
        button("＋ Add contact", "edit-contact", "", true),
    ) +
    `<section class="panel"><div class="table-toolbar"><label class="search-wrap" style="margin:0"><span>⌕</span><input id="table-search" aria-label="Search contacts" placeholder="Find a person, company, or email…" value="${e(state.search)}"></label><div class="actions"><select class="filter-select" id="stage-filter" aria-label="Filter by stage"><option value="all">All stages</option>${STAGES.map((s) => `<option value="${s}" ${state.filter === s ? "selected" : ""}>${LABELS[s]}</option>`).join("")}</select>${button("List quality ↗", "score-list")}</div></div>${page.length ? contactTable(page) : empty(list.length ? "No contacts on this page" : "No contacts found", "Try another search, or add someone new to your network.")}<div class="table-foot"><span>${number(list.length)} contacts · page ${state.page + 1} of ${Math.max(1, Math.ceil(list.length / 25))}</span><div class="actions"><button class="text-button" data-action="prev-page" ${!state.page ? "disabled" : ""}>← Previous</button><button class="text-button" data-action="next-page" ${state.page * 25 + 25 >= list.length ? "disabled" : ""}>Next →</button></div></div></section>`
  );
}
function companies() {
  const grouped = new Map();
  state.data.contacts
    .filter((c) => c.company)
    .forEach((c) => {
      const key = c.company.trim().toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(c);
    });
  return (
    heading(
      "THE BIGGER PICTURE",
      "Meet the businesses <em>behind the names.</em>",
      "Company relationships are grouped automatically from your contacts.",
      button("Find lookalikes ↗", "run-workflow", "disco-like", true),
    ) +
    `<div class="section-grid">${[...grouped.values()].map((cs) => `<article class="panel workflow-card"><span class="avatar blue">${e(cs[0].company.slice(0, 2).toUpperCase())}</span><h3 style="margin-top:18px">${e(cs[0].company)}</h3><p>${cs.length} contact${cs.length === 1 ? "" : "s"} · ${money(cs.filter((c) => c.stage !== "lost").reduce((sum, c) => sum + Number(c.value || 0), 0))} potential value</p><footer><span class="badge">${e(cs[0].source || "No source")}</span><button class="text-button" data-action="company-contacts" data-id="${e(cs[0].company)}">View people ↗</button></footer></article>`).join("")}</div>${!grouped.size ? empty("Companies will appear here", "Add company names to your contacts to see the bigger picture.") : ""}`
  );
}
function pipeline() {
  return (
    heading(
      "FROM HELLO TO WHAT’S NEXT",
      "Relationships <em>in motion.</em>",
      "Open a card to update its stage, value, or next follow-up.",
      button("＋ Add opportunity", "edit-contact", "", true),
    ) +
    `<div class="kanban">${STAGES.map((s, i) => {
      const cs = state.data.contacts.filter((c) => c.stage === s);
      return `<section class="kanban-column"><h3><span><span class="tiny-dot" style="background:${colors[i]}"></span>${LABELS[s]}</span><span>${cs.length}</span></h3>${cs.map((c) => `<button class="deal-card" data-action="edit-contact" data-id="${e(c.id)}"><strong>${e(c.company || name(c))}</strong><p>${e(name(c))}<br>${e(c.title || "Add a role")}</p><footer><span>${money(c.value)}</span><span class="avatar">${e(initials(c))}</span></footer><time>${c.next_action_at ? "Next move · " + date(c.next_action_at) : "No follow-up scheduled"}</time></button>`).join("")}${!cs.length ? '<p class="help">Room for your next opportunity.</p>' : ""}</section>`;
    }).join("")}</div>`
  );
}
function campaigns() {
  return (
    heading(
      "A MESSAGE WITH A PURPOSE",
      "Make every <em>hello count.</em>",
      "Build thoughtful, permission-based campaigns with your existing mailbox.",
      button("Get copy ideas ↗", "run-workflow", "campaign-copywriting") +
        button("＋ New campaign", "edit-campaign", "", true),
    ) +
    `<section class="panel"><div class="panel-head"><div><h2>Your campaigns</h2><p>Draft, review, then send in small batches.</p></div><span class="status-note">RESEND · YOUR EXISTING DOMAIN</span></div>${
      state.data.campaigns.length
        ? `<div class="table-wrap"><table><thead><tr><th>CAMPAIGN</th><th>STATUS</th><th>AUDIENCE</th><th>SENT</th><th>POSITIVE REPLIES</th><th></th></tr></thead><tbody>${state.data.campaigns
            .map((c) => {
              const rs = state.data.recipients.filter(
                  (r) => r.campaign_id === c.id,
                ),
                m = campaignDisplayMetrics(c, [
                  ...rs,
                  ...(state.data.followups || []).filter(
                    (r) => r.campaign_id === c.id,
                  ),
                ]);
              return `<tr><td><button class="row-link" data-action="campaign" data-id="${e(c.id)}"><strong>${e(c.name)}</strong><p class="help" style="margin:5px 0 0">Created ${date(c.created_at)}</p></button></td><td>${badge(c.status)}</td><td>${rs.length}</td><td>${m.sent}</td><td>${m.positive} <span class="status-note">· ${m.positive === "—" ? "—" : m.positiveRate.toFixed(1) + "%"}</span></td><td>${button("Open ↗", "campaign", c.id)}</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : empty(
            "A good message deserves a good plan",
            "Create a draft, choose your audience, and review every detail before sending.",
            button("Create campaign", "edit-campaign", "", true),
          )
    }</section><p class="help">Prospecting lists belong in Contacts. Resend campaigns accept only contacts with recorded permission. Configure outbound sequences with Smartlead or Instantly using Sequence & schedule.</p>`
  );
}
function inbox() {
  return (
    heading(
      "KEEP THE CONVERSATION GOING",
      "Your inbox. <em>Right where it belongs.</em>",
      "The InstelTech mail workspace, connected to the rest of your CRM.",
      '<a class="button" href="../mail/" target="_blank" rel="noopener">Open full inbox ↗</a>',
    ) +
    (state.demo
      ? `<section class="panel">${empty("Your existing inbox lives here", "Sign in to use your real mailbox, including threads, replies, attachments, and MFA. Demo mode cannot access live mail.", button("Sign in to mail", "leave-demo", "", true))}</section>`
      : '<iframe class="mail-frame" src="../mail/?embedded=1" title="InstelTech mailbox"></iframe>')
  );
}
function workflows() {
  const groups = [
    "All",
    "Strategy",
    "Prospecting",
    "Copy & send",
    "Infrastructure",
    "Operations",
    "Signals",
  ];
  const list = state.catalog.filter(
    (w) =>
      (state.workflowGroup === "All" || w.group === state.workflowGroup) &&
      `${w.title} ${w.description}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  const native = `<div class="actions" style="margin-bottom:20px">${button("Find prospects", "find-prospects")}${button("Check email copy", "copy-check")}${button("Score contact list", "score-list")}${button("Weekly tasks", "weekly-rhythm")}${button("Check infrastructure", "infrastructure")}</div>`;
  return (
    heading(
      "A LITTLE EXPERTISE ON TAP",
      "Big ideas. <em>Clear next steps.</em>",
      `${state.catalog.length} imported workflows and playbooks, with your business context built in.`,
      button("View job queue", "jobs"),
    ) +
    native +
    automationPanel() +
    `<div class="table-toolbar panel" style="margin-bottom:18px"><label class="search-wrap" style="margin:0"><span>⌕</span><input id="table-search" aria-label="Search workflows" placeholder="Find a workflow or buying signal…" value="${e(state.search)}"></label><span class="status-note">AI jobs run on your connected Codex runner</span></div><div class="tabs">${groups.map((g) => `<button class="tab ${state.workflowGroup === g ? "active" : ""}" data-action="workflow-group" data-id="${e(g)}">${g}</button>`).join("")}</div><div class="section-grid">${list.map((w) => `<article class="panel workflow-card"><span class="workflow-icon">${w.group === "Signals" ? "⌁" : "↗"}</span><h3>${e(w.title)}</h3><p>${e(w.description)}</p><footer><span class="badge">${e(w.group)}</span><button class="text-button" data-action="run-workflow" data-id="${e(w.id)}">${w.mode === "reference" ? "Open reference" : "Start workflow"} ↗</button></footer></article>`).join("")}</div>${!list.length ? empty("No matching workflows", "Try a broader search or another category.") : ""}`
  );
}
function reports() {
  const d = state.data,
    m = campaignMetrics([...d.recipients, ...(d.followups || [])]),
    score = scoreList(d.contacts);
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10),
  );
  const counts = days.map(
      (day) =>
        [...d.recipients, ...(d.followups || [])].filter(
          (r) => r.status === "sent" && r.sent_at?.slice(0, 10) === day,
        ).length,
    ),
    max = Math.max(1, ...counts);
  return (
    heading(
      "LEARN. REFINE. REPEAT.",
      "A clearer view <em>of what works.</em>",
      "Measure conversations and qualified opportunities, not vanity metrics.",
      button("＋ New experiment", "experiment", "", true),
    ) +
    providerMetricsPanel(d.campaigns) +
    `<div class="stats">${stat("Messages sent", m.sent, "Confirmed native mailbox sends", "campaigns")}${stat("Replies recorded", m.replied, `${m.replyRate.toFixed(1)}% of sent messages`, "inbox")}${stat("Positive replies", m.positive, `${m.positiveRate.toFixed(1)}% positive reply rate`, "contacts")}${stat("Won pipeline", money(d.contacts.filter((c) => c.stage === "won").reduce((s, c) => s + Number(c.value || 0), 0)), "Recorded opportunity values in USD", "pipeline")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Your last seven days</h2><p>Confirmed campaign sends, by day.</p></div></div><div class="panel-body"><div class="chart-bars" role="img" aria-label="${e(days.map((day, i) => `${day}: ${counts[i]} sent`).join("; "))}">${counts.map((n) => `<div class="chart-bar" style="height:${(n / max) * 140 + 2}px"><span>${n}</span></div>`).join("")}</div><div class="chart-labels">${days.map((day) => `<span>${date(day)}</span>`).join("")}</div></div></section><section class="panel"><div class="panel-head"><div><h2>A healthier list, a better start</h2><p>Data completeness · ${score.score}/100</p></div></div><div class="panel-body">${score.dimensions
      .slice(0, 4)
      .map(
        ([label, value]) =>
          `<div class="score-row"><span>${label}</span><div class="progress"><i style="width:${value}%"></i></div><span>${value}%</span></div>`,
      )
      .join(
        "",
      )}<button class="text-button" style="margin-top:15px" data-action="score-list">View all eight dimensions ↗</button></div></section></div><section class="panel"><div class="panel-head"><div><h2>Make every experiment teach you something</h2><p>One variable at a time. Positive replies as the outcome.</p></div></div>${
      d.experiments.length
        ? `<div class="panel-body mini-list">${d.experiments
            .map((ex) => {
              const a = campaignMetrics(
                  [...d.recipients, ...(d.followups || [])].filter(
                    (r) => r.campaign_id === ex.campaign_a,
                  ),
                ),
                b = campaignMetrics(
                  [...d.recipients, ...(d.followups || [])].filter(
                    (r) => r.campaign_id === ex.campaign_b,
                  ),
                );
              return `<div><section><strong>${e(ex.name)}</strong><p>${e(ex.hypothesis)}</p><p>Variable: ${e(ex.variable)} · A: ${a.positive}/${a.sent} · B: ${b.positive}/${b.sent}</p></section><span class="badge">${a.sent < 100 || b.sent < 100 ? "Collect more data" : "Review outcomes"}</span></div>`;
            })
            .join("")}</div>`
        : empty(
            "Curiosity is a growth strategy",
            "Write a hypothesis and compare two campaigns that differ in just one variable.",
            button("Design an experiment", "experiment"),
          )
    }</section><p class="help">Replies linked to a sent campaign thread are recorded as neutral until reviewed. Classify them in each campaign. No open tracking or statistical significance is inferred.</p>`
  );
}
function settings() {
  const s = state.data.settings,
    workers = state.data.workers;
  return (
    heading(
      "MAKE IT YOUR WORKSPACE",
      "Everything connected. <em>Nothing scattered.</em>",
      "Your business context, mailbox, and AI execution in one place.",
      button("Codex settings", "automation-codex") +
        button("Provider connections", "automation-connections"),
    ) +
    `<section class="panel"><div class="panel-head"><h2>Business profile</h2>${button("Edit profile", "profile")}</div><div class="setting-row"><div><h3>${e(s.company_name || "Instel Technologies")}</h3><p>${e(s.offer || "Add your offer and ideal customer to give every workflow a better starting point.")}</p><p>${e(s.audience || "")}</p></div><span class="badge">Shared team context</span></div><div class="setting-row"><div><h3>Campaign sender details</h3><p>${e(s.physical_address || "Add your physical business address before sending campaigns.")}<br>${e(s.unsubscribe_email || "Add an opt-out mailbox.")}</p></div>${badge(s.physical_address && s.unsubscribe_email ? "qualified" : "queued", s.physical_address && s.unsubscribe_email ? "Configured" : "Setup needed")}</div></section><section class="panel" style="margin-top:22px"><div class="panel-head"><h2>Connections</h2></div><div class="setting-row"><div><h3>Resend + your existing domain</h3><p>Your current mailbox handles conversations and permission-based campaigns. No Dynadot purchase or Zapmail inbox provisioning is required.</p></div>${button("Check connection", "infrastructure")}</div><div class="setting-row"><div><h3>Codex · ChatGPT subscription</h3><p>Connect a trusted computer signed into Codex. Dashboard buttons queue research and authorized provider operations. The computer must remain online.</p></div>${button("Connect runner ↗", "connect-worker", "", true)}</div>${workers.map((w) => `<div class="setting-row"><div><h3>${e(w.name)}</h3><p>Last seen: ${w.last_seen_at ? e(new Date(w.last_seen_at).toLocaleString()) : "Not connected yet"}</p></div><div class="actions">${badge(!w.active ? "suppressed" : w.last_seen_at && Date.now() - new Date(w.last_seen_at).getTime() < 120000 ? "qualified" : "queued", !w.active ? "Revoked" : w.last_seen_at && Date.now() - new Date(w.last_seen_at).getTime() < 120000 ? "Online" : "Offline")}${w.active ? button("Revoke", "revoke-worker", w.id) : ""}</div></div>`).join("")}<div class="setting-row"><div><h3>Outbound source library</h3><p>All ${state.catalog.length} upstream skill definitions and supporting files are stored inside this project. Source-specific APIs remain separate services; importing a skill does not provision them.</p></div><a class="button" href="./library/README.md" target="_blank" rel="noopener">View library ↗</a></div></section><section class="panel" style="margin-top:22px"><div class="setting-row"><div><h3>Workspace access</h3><p>Uses the same Supabase accounts and active team membership as your private mailbox.</p></div>${button(state.demo ? "Exit demo" : "Sign out", "signout")}</div>${state.demo ? `<div class="setting-row"><div><h3>Reset sample workspace</h3><p>Start again with the original sample contacts and campaigns.</p></div>${button("Reset demo", "reset-demo")}</div>` : ""}</section>`
  );
}

function editContact(id) {
  const c = state.data.contacts.find((c) => c.id === id) || {};
  modal(
    id ? "A little more about this connection" : "Add someone to your network",
    `<form><div class="form-grid">${field("First name", "first_name", c.first_name, "text", 'maxlength="120"')}${field("Last name", "last_name", c.last_name, "text", 'maxlength="120"')}<div class="full">${field("Email address", "email", c.email, "email", 'required maxlength="319"')}</div>${field("Company", "company", c.company, "text", 'maxlength="200"')}${field("Job title", "title", c.title, "text", 'maxlength="200"')}${field("Website", "website", c.website, "url")}${field("Source", "source", c.source || "Manual")}${select(
      "Relationship stage",
      "stage",
      STAGES.map((s) => [s, LABELS[s]]),
      c.stage || "new",
    )}${field("Opportunity value · USD", "value", c.value || 0, "number", 'min="0" step="0.01"')}${field("Next follow-up", "next_action_at", c.next_action_at, "date")}<div class="full">${area("Context for your next conversation", "notes", c.notes || "")}<label class="check-label"><input type="checkbox" name="consent" ${c.consent ? "checked" : ""}>This contact gave permission to receive marketing email.</label>${field("Permission evidence · where and when", "consent_note", c.consent_note || "", "text", 'placeholder="e.g. Website opt-in, 13 September 2026"')}<label class="check-label"><input type="checkbox" name="suppressed" ${c.suppressed ? "checked" : ""}>Suppress all campaign sends to this contact.</label></div></div>${submit(id ? "Save connection" : "Add contact")}</form>`,
    async (f) => {
      const payload = {
        ...f,
        email: f.email.trim().toLowerCase(),
        value: Number(f.value),
        consent: f.consent === "on",
        suppressed: f.suppressed === "on",
        next_action_at: f.next_action_at || null,
      };
      if (payload.consent && !payload.consent_note.trim())
        throw new Error("Record where and when this contact gave permission.");
      if (!id && state.data.contacts.some((c) => c.email === payload.email))
        throw new Error("This email is already in your workspace.");
      await save("contacts", payload, id || undefined);
      close();
      await load(false);
      toast("Connection saved.");
    },
  );
}
function contactDetail(id) {
  const c = state.data.contacts.find((c) => c.id === id);
  if (!c) return;
  const notes = state.data.notes.filter((n) => n.contact_id === id);
  modal(
    name(c),
    `<div class="person"><span class="avatar rose">${e(initials(c))}</span><div><strong>${e(c.company || c.email)}</strong><small>${e(c.title || "")}</small></div></div><p class="help">${e(c.email)} · ${e(c.source || "No source")} · ${money(c.value)}</p><div class="actions">${badge(c.stage, LABELS[c.stage])}${button("Edit connection", "edit-contact", id)}${!state.demo ? `<a class="button" href="../mail/?to=${encodeURIComponent(c.email)}" target="_blank" rel="noopener">Write email ↗</a>` : ""}</div>${c.notes ? `<pre class="output">${e(c.notes)}</pre>` : ""}<h3 class="subheading">Conversation notes</h3>${notes.map((n) => `<div class="activity-item"><span class="avatar">↗</span><div><p>${e(n.body)}</p><time>${date(n.created_at)}</time></div>`).join("") || '<p class="help">Capture a useful detail from your next conversation.</p>'}<form>${area("Add a note", "body", "", 'required maxlength="10000"')}${submit("Save note")}</form>`,
    async (f) => {
      await save("notes", { contact_id: id, body: f.body });
      await load(false);
      contactDetail(id);
      toast("Note saved.");
    },
  );
}
function importContacts() {
  modal(
    "A new set of connections",
    `<p class="help">CSV columns: email, first_name, last_name, company, title, website, source. Imports never assume marketing permission.</p><button class="text-button" data-action="csv-template">Download a blank template ↓</button><form style="margin-top:20px"><label>Choose your CSV<input class="file-input" type="file" name="file" accept=".csv,text/csv" required></label>${submit("Preview import")}</form>`,
    async (_, form) => {
      const file = form.elements.file.files[0];
      if (file.size > 5_000_000)
        throw new Error("Choose a CSV smaller than 5 MB.");
      const result = prepareContacts(
        parseCSV(await file.text()),
        state.data.contacts,
      );
      if (result.contacts.length > 5000)
        throw new Error("Import at most 5,000 contacts at a time.");
      modal(
        "Review your import",
        `<div class="stats" style="grid-template-columns:repeat(3,1fr)">${stat("New", result.contacts.length, "Ready to import", "contacts")}${stat("Duplicates", result.duplicates, "Will be skipped", "contacts")}${stat("Invalid", result.errors.length, "Will be skipped", "contacts")}</div>${result.errors.length ? `<p class="notice">${e(result.errors.slice(0, 10).join(" · "))}</p>` : ""}${contactTable(result.contacts.slice(0, 5), true)}<p class="help">Previewing the first five contacts. Permission must be recorded individually before sending.</p><form>${submit("Import " + result.contacts.length + " contacts")}</form>`,
        async () => {
          if (!result.contacts.length)
            throw new Error("There are no new valid contacts to import.");
          // One database statement: all imported rows succeed or fail together.
          await save("contacts", result.contacts);
          close();
          await load(false);
          toast(`${result.contacts.length} new connections imported.`);
        },
      );
    },
  );
}
function editCampaign(id) {
  const c = state.data.campaigns.find((c) => c.id === id) || {};
  if (c.status === "active")
    throw new Error("Pause the campaign before editing its copy.");
  modal(
    id ? "Refine your campaign" : "Give your next campaign a purpose",
    `<form>${field("Campaign name", "name", c.name, "text", 'required maxlength="200"')}${field("Subject line", "subject", c.subject, "text", 'required maxlength="200"')}${area("Email body", "body", c.body || "Hi {{first_name}},\n\n", 'required maxlength="50000"')}<p class="help">Merge fields: {{first_name}}, {{last_name}}, {{company}}, {{title}}, {{email}}. Sender address and opt-out instructions are added automatically.</p>${select(
      "Audience stage",
      "audience_stage",
      STAGES.map((s) => [s, LABELS[s]]),
      c.audience_stage || "qualified",
    )}${submit("Save draft")}</form>`,
    async (f) => {
      await save(
        "campaigns",
        { ...f, ...(!id ? { status: "draft" } : {}) },
        id || undefined,
      );
      close();
      await load(false);
      toast("Campaign draft saved.");
    },
  );
}
function campaignDetail(id) {
  const c = state.data.campaigns.find((c) => c.id === id);
  if (!c) return;
  const rs = state.data.recipients.filter((r) => r.campaign_id === id),
    m = campaignDisplayMetrics(c, [
      ...rs,
      ...(state.data.followups || []).filter((r) => r.campaign_id === c.id),
    ]),
    warnings = checkCopy(c.subject, c.body);
  modal(
    c.name,
    `<div class="actions">${badge(c.status)}${button("Edit copy", "edit-campaign", id)}${button("Sequence & schedule", "automation-sequence", id)}${button("Delivery history", "automation-deliveries", id)}${button("Choose audience", "enroll", id)}${c.provider && c.provider !== "resend" ? button("Publish to provider", "automation-publish", id) : ""}${c.status === "active" ? button("Pause", "pause-campaign", id) : button("Review & activate", "activate-campaign", id, true)}</div><h3 class="subheading">${e(c.subject || "Add a subject")}</h3><pre class="output">${e(c.body)}</pre>${warnings.length ? `<p class="notice">${warnings.map(e).join("<br>")}</p>` : '<p class="help">No matches in the basic copy checklist. This does not predict inbox placement.</p>'}<div class="stats" style="grid-template-columns:repeat(3,1fr)">${stat("Audience", rs.length, "Enrolled contacts", "contacts")}${stat("Sent", m.sent, "Confirmed delivery requests", "campaigns")}${stat("Positive", m.positive, "Reviewed replies", "inbox")}</div>${c.status === "active" && (!c.provider || c.provider === "resend") ? `<p class="notice">Each click processes up to five pending contacts. Unknown outcomes are held for review.</p>${button("Send next batch · up to 5", "send-batch", id, true)}` : ""}${c.provider && c.provider !== "resend" ? `<p class="notice">${e(c.provider)} · ${(c.sequence || []).length + 1} steps · ${e(c.sending_config?.timezone || "Africa/Harare")} · ${c.sending_config?.autonomous ? "Automatic launch configured" : "Manual activation"}</p>` : ""}<h3 class="subheading">Audience & reply review</h3>${rs.some((r) => ["sending", "unknown"].includes(r.status)) ? button("Reconcile held sends", "reconcile-sends", id) : ""}<div class="mini-list">${
      rs
        .map((r) => {
          const ct = state.data.contacts.find((ct) => ct.id === r.contact_id);
          return `<div><section><strong>${e(ct ? name(ct) : "Deleted contact")}</strong><p>${e(r.error || ct?.email || "")}</p></section><div class="actions">${badge(r.status)}${r.status === "sent" ? `<button class="text-button" data-action="reply-score" data-id="${e(r.id)}">${e(r.reply_sentiment || "none")} ⌄</button>` : ""}</div></div>`;
        })
        .join("") || '<p class="help">Choose an audience before activating.</p>'
    }</div>`,
  );
}
function enroll(id) {
  const campaign = state.data.campaigns.find((c) => c.id === id);
  if (!["draft", "paused"].includes(campaign.status))
    throw new Error("Pause this campaign before changing its audience.");
  const existing = new Set(
    state.data.recipients
      .filter((r) => r.campaign_id === id)
      .map((r) => r.contact_id),
  );
  const eligible = state.data.contacts.filter(
    (c) =>
      c.stage === campaign.audience_stage &&
      ((campaign.provider && campaign.provider !== "resend") ||
        (c.consent && c.consent_note)) &&
      !c.suppressed &&
      !existing.has(c.id),
  );
  modal(
    "Choose who this message is for",
    `<p class="help">Stage: ${e(LABELS[campaign.audience_stage])}. ${campaign.provider && campaign.provider !== "resend" ? "Outbound provider audience. Suppressed contacts are excluded." : "Only contacts with recorded marketing permission are eligible."} Edit the campaign to change the stage.</p><form>${
      eligible
        .slice(0, 500)
        .map(
          (c) =>
            `<label class="check-label"><input type="checkbox" name="contacts" value="${e(c.id)}" checked>${e(name(c))} · ${e(c.company)}</label>`,
        )
        .join("") ||
      '<p class="notice">No new eligible contacts in this stage. Record permission in Contacts first.</p>'
    }${submit("Add selected contacts")}</form>`,
    async (_, form) => {
      const ids = new FormData(form).getAll("contacts");
      if (!ids.length) throw new Error("Select at least one eligible contact.");
      if (state.demo) {
        await save(
          "recipients",
          ids.map((contact_id) => ({
            contact_id,
            campaign_id: id,
            status: "pending",
            reply_sentiment: "none",
          })),
        );
      } else await action("enroll", { campaign_id: id, contacts: ids });
      await load(false);
      campaignDetail(id);
      toast("Audience updated.");
    },
  );
}
function runWorkflow(id) {
  const w = state.catalog.find((w) => w.id === id);
  if (!w) throw new Error("Workflow not found in the imported catalog.");
  const reference = `<a class="text-button" href="./${encodeURI(w.path)}" target="_blank" rel="noopener">Read original workflow ↗</a>`;
  modal(
    w.title,
    `<p class="help">${e(w.description)}</p>${reference}<p class="notice" style="margin-top:18px">Runs research and provider tools through your connected Codex runner. Your Codex settings control web research, sub-agents and reasoning effort. Missing connections appear as explicit execution errors.</p><form>${area("What would you like to achieve?", "brief", "", 'required maxlength="12000" placeholder="Describe the audience, objective, constraints, and the outcome you want."')}<label class="check-label"><input type="checkbox" name="allow_provider_writes">Allow the provider changes described in this request (including uploads, Clay builds or campaign activation).</label>${select(
      "Include contact context",
      "contacts",
      [
        ["none", "Business profile only"],
        ["qualified", "Up to 50 qualified contacts"],
        ["all", "Up to 50 most recent contacts"],
      ],
      "none",
    )}${submit("Queue workflow")}</form>`,
    async (f) => {
      const chosen =
        f.contacts === "none"
          ? []
          : state.data.contacts
              .filter((c) => f.contacts === "all" || c.stage === "qualified")
              .slice(0, 50);
      await save("jobs", {
        workflow_id: w.id,
        title: w.title,
        input: {
          brief: f.brief,
          execution: {
            allow_provider_writes: f.allow_provider_writes === "on",
          },
          profile: state.data.settings,
          contacts: chosen.map(
            ({
              first_name,
              last_name,
              email,
              company,
              title,
              website,
              stage,
              source,
            }) => ({
              first_name,
              last_name,
              email,
              company,
              title,
              website,
              stage,
              source,
            }),
          ),
        },
        status: "queued",
        output: "",
      });
      close();
      await load(false);
      toast(
        state.demo
          ? "Demo job added. No AI will run in this workspace."
          : "Workflow queued. Your connected Codex runner will pick it up.",
      );
      jobsDialog();
    },
  );
}
function jobsDialog() {
  modal(
    "Your workflow queue",
    `<p class="help">Jobs use your connected runner. Provider actions are saved in execution history. Cancellation stops queued work; an in-flight request may finish.</p><div class="mini-list">${state.data.jobs.map((j) => `<div><section><strong>${e(j.title)}</strong><p>${date(j.created_at)} · ${e(j.error || j.workflow_id)}</p></section><div class="actions">${badge(j.status)}${j.status === "completed" ? button("View result", "job-result", j.id) : ["queued", "running"].includes(j.status) ? button("Cancel", "cancel-job", j.id) : ""}</div></div>`).join("") || '<p class="help">Start a workflow to see it here.</p>'}</div><div class="dialog-actions">${button("Refresh queue", "refresh-jobs")}</div>`,
  );
}
function profile() {
  const s = state.data.settings;
  modal(
    "Give every workflow the right context",
    `<form>${field("Company name", "company_name", s.company_name, "text", "required")}${field("Website", "website", s.website, "url")}${area("What you offer", "offer", s.offer || "")}${area("Ideal customer profile", "audience", s.audience || "")}${field("Physical business address", "physical_address", s.physical_address)}${field("Opt-out mailbox", "unsubscribe_email", s.unsubscribe_email, "email")}${submit("Save business profile")}</form>`,
    async (f) => {
      await save("settings", f, true);
      close();
      await load(false);
      toast("Business profile updated.");
    },
  );
}
function scoreListDialog() {
  const { score, dimensions } = scoreList(state.data.contacts);
  modal(
    "A closer look at your contact list",
    `<div class="stat-value">${score}<span class="help"> / 100 · data completeness</span></div>${dimensions.map(([label, value]) => `<div class="score-row"><span>${label}</span><div class="progress"><i style="width:${value}%"></i></div><span>${value}%</span></div>`).join("")}<p class="notice" style="margin-top:20px">This checks local data completeness and email syntax. It does not verify mailbox existence, deliverability, or consent authenticity.</p>`,
  );
}
function copyCheck() {
  modal(
    "A second look before you send",
    `<form>${field("Subject", "subject", "", "text", "required")}${area("Email body", "body", "", "required")}${submit("Check copy")}</form>`,
    async (f) => {
      const warnings = checkCopy(f.subject, f.body);
      modal(
        "Your copy checklist",
        `<p class="notice">${warnings.length ? warnings.map(e).join("<br>") : "No matches in the basic copy checklist."}</p><p class="help">A phrase checklist cannot predict inbox placement. Review relevance, permission, and your sender reputation too.</p><pre class="output">${e(f.subject)}\n\n${e(f.body)}</pre>`,
      );
    },
  );
}
function experiment() {
  const options = [
    ["", "Choose campaign"],
    ...state.data.campaigns.map((c) => [c.id, c.name]),
  ];
  modal(
    "Turn a question into an experiment",
    `<form>${field("Experiment name", "name", "", "text", "required")}${area("Hypothesis", "hypothesis", "", 'required placeholder="If we change …, positive replies will improve because …"')}${field("The one variable that changes", "variable", "", "text", 'required placeholder="e.g. call to action"')}${select("Control campaign", "campaign_a", options, "")}${select("Variant campaign", "campaign_b", options, "")}<p class="help">Use comparable audiences and change only one variable. The report shows observed rates; it does not declare statistical significance.</p>${submit("Save experiment")}</form>`,
    async (f) => {
      if (!f.campaign_a || !f.campaign_b || f.campaign_a === f.campaign_b)
        throw new Error("Choose two different campaigns.");
      await save("experiments", f);
      close();
      await load(false);
      toast("Experiment recorded.");
    },
  );
}
async function infrastructure() {
  modal(
    "Your sending infrastructure",
    '<p class="help">Checking the existing sender connection…</p>',
  );
  try {
    const data = state.demo
      ? {
          resend: false,
          domains: [],
          domainError: "Sign in to check your real Resend connection.",
          providers: {},
        }
      : await action("infrastructure");
    modal(
      "Your sending infrastructure",
      `<p class="notice">${state.demo ? e(data.domainError) : data.resend ? "Resend credentials are configured on the backend." : "RESEND_API_KEY is missing from Supabase secrets."}</p>${data.domainError && !state.demo ? `<p class="help">${e(data.domainError)}</p>` : ""}<div class="mini-list">${data.domains.map((d) => `<div><strong>${e(d.name)}</strong>${badge(d.status === "verified" ? "qualified" : "queued", d.status)}</div>`).join("")}</div><p class="help">Domain verification is a setup check, not a spam-placement or reputation test. The full audit and incident-response playbooks are available in Workflows.</p>${button("Audit playbook ↗", "run-workflow", "email-deliverability-audit")}`,
    );
  } catch (error) {
    close();
    throw error;
  }
}

async function handleAction(key, id, el) {
  if (await automationUI.handle(key, id)) return;
  if (key === "find-prospects") return findProspects();
  if (key === "reconcile-sends") {
    const result = await action("reconcile_sends", { campaign_id: id });
    await load(false);
    campaignDetail(id);
    return toast(
      `${result.reconciled} outcomes recovered. ${result.held} still require a provider check.`,
    );
  }
  if (key === "close") return close();
  if (key === "edit-contact") return editContact(id);
  if (key === "contact") return contactDetail(id);
  if (key === "import") return importContacts();
  if (key === "csv-template")
    return download(
      "instel-contacts-template.csv",
      toCSV(
        [],
        [
          "email",
          "first_name",
          "last_name",
          "company",
          "title",
          "website",
          "source",
        ],
      ),
      "text/csv",
    );
  if (key === "export")
    return download(
      "instel-contacts.csv",
      toCSV(filteredContacts(), [
        "email",
        "first_name",
        "last_name",
        "company",
        "title",
        "website",
        "source",
        "stage",
        "value",
        "consent",
        "consent_note",
        "suppressed",
      ]),
      "text/csv",
    );
  if (key === "score-list") return scoreListDialog();
  if (key === "copy-check") return copyCheck();
  if (key === "prev-page" || key === "next-page") {
    state.page += key === "next-page" ? 1 : -1;
    return render();
  }
  if (key === "company-contacts") {
    state.search = id;
    state.filter = "all";
    state.page = 0;
    location.hash = "contacts";
    return;
  }
  if (key === "edit-campaign") return editCampaign(id);
  if (key === "campaign") return campaignDetail(id);
  if (key === "enroll") return enroll(id);
  if (key === "pause-campaign") {
    await save("campaigns", { status: "paused" }, id);
    await load(false);
    return campaignDetail(id);
  }
  if (key === "activate-campaign") {
    const c = state.data.campaigns.find((c) => c.id === id),
      rs = state.data.recipients.filter(
        (r) => r.campaign_id === id && r.status === "pending",
      );
    if (!c.subject || !c.body || !rs.length)
      throw new Error("Add copy and at least one pending recipient first.");
    for (const r of rs) {
      const ct = state.data.contacts.find((ct) => ct.id === r.contact_id);
      if (!ct || !ct.consent || !ct.consent_note || ct.suppressed)
        throw new Error(
          "The audience contains an ineligible contact. Review permission and suppression first.",
        );
      renderTemplate(c.subject, ct);
      renderTemplate(c.body, ct);
      for (const step of c.sequence || []) {
        renderTemplate(step.subject, ct);
        renderTemplate(step.body, ct);
      }
    }
    return modal(
      "Ready for a thoughtful introduction?",
      `<p class="notice">Activate “${e(c.name)}” with ${rs.length} pending recipients. ${c.sending_config?.autonomous ? "Background sending will start within your configured sending window. Follow-ups stop on replies when configured." : "Use Send next batch to process due messages."}</p><pre class="output">${e(
        renderTemplate(
          c.subject,
          state.data.contacts.find((ct) => ct.id === rs[0].contact_id),
        ),
      )}\n\n${e(
        renderTemplate(
          c.body,
          state.data.contacts.find((ct) => ct.id === rs[0].contact_id),
        ),
      )}</pre><form><label class="check-label"><input type="checkbox" required>I reviewed the audience, permission records, and message.</label>${submit("Activate campaign")}</form>`,
      async () => {
        await save("campaigns", { status: "active" }, id);
        await load(false);
        campaignDetail(id);
      },
    );
  }
  if (key === "send-batch") {
    const result = await action("send_batch", { campaign_id: id });
    await load(false);
    campaignDetail(id);
    return toast(
      `${result.results.filter((r) => r.status === "sent").length} sent. ${result.results.filter((r) => r.status !== "sent").length} held or failed. ${result.results.length ? "Review the recipient list for details." : "No pending recipients remain."}`,
    );
  }
  if (key === "reply-score") {
    const r = state.data.recipients.find((r) => r.id === id);
    return modal(
      "What did this reply tell you?",
      `<form>${select(
        "Reply classification",
        "sentiment",
        ["none", "positive", "neutral", "negative", "unsubscribe"].map((v) => [
          v,
          v,
        ]),
        r.reply_sentiment,
      )}<p class="help">Unsubscribe suppresses this contact across all campaigns.</p>${submit("Save classification")}</form>`,
      async (f) => {
        if (state.demo) {
          await save("recipients", { reply_sentiment: f.sentiment }, id);
          if (f.sentiment === "unsubscribe")
            await save("contacts", { suppressed: true }, r.contact_id);
        } else await action("score_reply", { id, sentiment: f.sentiment });
        await load(false);
        campaignDetail(r.campaign_id);
      },
    );
  }
  if (key === "run-workflow") return runWorkflow(id);
  if (key === "workflow-group") {
    state.workflowGroup = id;
    return render();
  }
  if (key === "jobs") return jobsDialog();
  if (key === "refresh-jobs") {
    await load(false);
    return jobsDialog();
  }
  if (key === "job-result") {
    const job = state.data.jobs.find((j) => j.id === id);
    return modal(
      job.title,
      `<p class="notice">Review this artifact before using it. Generated results are not verified facts or completed external actions.</p><pre class="output">${e(job.output)}</pre><div class="dialog-actions">${button("Download result ↓", "download-job", id)}</div>`,
    );
  }
  if (key === "download-job") {
    const job = state.data.jobs.find((j) => j.id === id);
    return download(`${job.workflow_id}-${job.id}.md`, job.output);
  }
  if (key === "cancel-job") {
    if (state.demo) await save("jobs", { status: "cancelled" }, id);
    else await action("cancel_job", { id });
    await load(false);
    return jobsDialog();
  }
  if (key === "profile") return profile();
  if (key === "experiment") return experiment();
  if (key === "infrastructure") return infrastructure();
  if (key === "new-task")
    return modal(
      "Make space for your next move",
      `<form>${field("What needs to happen?", "title", "", "text", 'required maxlength="500"')}${field("When?", "due_at", today(), "date", "required")}${submit("Add follow-up")}</form>`,
      async (f) => {
        await save("tasks", { ...f, completed: false });
        close();
        await load(false);
        toast("Follow-up added.");
      },
    );
  if (key === "complete-task") {
    await save("tasks", { completed: true }, id);
    await load(false);
    return toast("One more thing moved forward.");
  }
  if (key === "weekly-rhythm")
    return modal(
      "A simple rhythm for the week",
      `<p class="help">Monday: list health and deliverability. Wednesday: copy and experiments. Friday: replies and next steps.</p><form>${field("Monday of the week", "date", nextMonday(), "date", "required")}${submit("Add weekly checklist")}</form>`,
      async (f) => {
        const start = new Date(f.date + "T12:00:00Z");
        if (start.getUTCDay() !== 1)
          throw new Error("Choose a Monday for the weekly checklist.");
        const tasks = [
          [0, "Review list quality and sender health"],
          [2, "Review campaign copy and one experiment"],
          [4, "Score replies and plan next week"],
        ]
          .map(([offset, title]) => {
            const due = new Date(start);
            due.setUTCDate(due.getUTCDate() + offset);
            return {
              title,
              due_at: due.toISOString().slice(0, 10),
              completed: false,
            };
          })
          .filter(
            (t) =>
              !state.data.tasks.some(
                (x) => x.title === t.title && x.due_at === t.due_at,
              ),
          );
        if (tasks.length) await save("tasks", tasks);
        close();
        await load(false);
        toast(`${tasks.length} weekly tasks added.`);
      },
    );
  if (key === "connect-worker")
    return modal(
      "Connect your Codex subscription",
      `<p class="help">Your trusted computer runs Codex using its existing ChatGPT sign-in. The CRM exchanges only queued jobs and results through Supabase.</p><ol class="help"><li>Create and download a runner connection file below.</li><li>Open <strong>Start CRM Runner</strong> from this repository’s scripts folder. It reads the connection file from Downloads.</li><li>Leave the runner open. Start workflows here with a button.</li></ol><p class="notice">One-time setup needs Node.js and an installed, signed-in Codex CLI. GitHub Pages and Supabase cannot run your local subscription session. Treat the downloaded connection file as a secret.</p><form>${field("Computer name", "name", "My Codex computer", "text", "required")}${submit("Download connection file")}</form>`,
      async (f) => {
        const config = await action("connect_worker", { name: f.name });
        download(
          "instel-crm-runner.json",
          JSON.stringify(config, null, 2),
          "application/json",
        );
        close();
        await load(false);
        toast(
          "Connection file downloaded. Open Start CRM Runner on your trusted computer.",
        );
      },
    );
  if (key === "revoke-worker") {
    await action("revoke_worker", { id });
    await load(false);
    return toast("Runner access revoked.");
  }
  if (key === "reset-demo") {
    state.data = demoData();
    persistDemo();
    render();
    return toast("Demo reset.");
  }
  if (key === "leave-demo") return location.assign(location.pathname);
  if (key === "signout") {
    close();
    if (!state.demo) await state.db.auth.signOut();
    location.assign(location.pathname);
  }
}

function findProspects() {
  modal(
    "Find the right people · Prospeo",
    `<p class="notice">This uses your connected Prospeo account and may consume provider credits. Search returns up to 25 people per page. Revealing an email is a separate action. Imported prospects have no marketing permission.</p><form>${field("Job titles · comma separated", "titles", "Founder, CEO")}${field("Location · provider location value", "location", "", "text", 'placeholder="e.g. Zimbabwe #ZW"')}${field("Industry · comma separated", "industry")}${field("Page", "page", 1, "number", 'min="1" max="1000" required')}${submit("Search Prospeo")}</form>`,
    async (f) => {
      const data = await action("search_prospects", f);
      const show = () => {
        modal(
          "Your prospect search",
          `<p class="help">Page ${Number(data.pagination?.current_page || f.page)} · ${Number(data.pagination?.total_count || data.people.length).toLocaleString()} matches. Search records do not expose email addresses until revealed.</p><div class="mini-list">${data.people.map((p, i) => `<div><section><strong>${e([p.first_name, p.last_name].filter(Boolean).join(" "))}</strong><p>${e(p.title)} · ${e(p.company)}</p><p>${e(p.email || "Email not revealed")}</p></section><button class="button" data-prospect="${i}" ${!p.person_id ? "disabled" : ""}>${p.email ? "Add to CRM" : "Reveal email"}</button></div>`).join("") || '<p class="help">No matches. Try broader filters.</p>'}</div><div class="dialog-actions">${button("New search", "find-prospects")}</div>`,
        );
        $("#dialog-body")
          .querySelectorAll("[data-prospect]")
          .forEach(
            (b) =>
              (b.onclick = () =>
                void guarded(async () => {
                  b.disabled = true;
                  try {
                    const i = Number(b.dataset.prospect),
                      p = data.people[i];
                    if (!p.email) {
                      const result = await action("reveal_prospect", {
                        person_id: p.person_id,
                      });
                      if (!result.person.email)
                        throw new Error(
                          "The provider did not reveal a verified email for this person.",
                        );
                      data.people[i] = {
                        ...p,
                        ...Object.fromEntries(
                          Object.entries(result.person).filter(
                            ([, value]) => value !== "" && value != null,
                          ),
                        ),
                      };
                      show();
                      toast(
                        "Email revealed. Review before adding this prospect.",
                      );
                    } else {
                      const result = prepareContacts([p], state.data.contacts);
                      if (!result.contacts.length)
                        throw new Error(
                          result.duplicates
                            ? "This email is already in your CRM."
                            : "The provider returned an invalid email address.",
                        );
                      await save("contacts", result.contacts);
                      await load(false);
                      toast(
                        "Prospect added. Marketing permission is not recorded.",
                      );
                      b.textContent = "Added";
                    }
                  } finally {
                    b.disabled = false;
                  }
                })),
          );
      };
      show();
    },
  );
}

async function guarded(fn) {
  try {
    await fn();
  } catch (error) {
    toast(error.message || "Something went wrong. Please try again.", true);
  }
}
const automationUI = createAutomationUI({
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
});
document.addEventListener("click", (event) => {
  const go = event.target.closest("[data-go]");
  if (go) {
    close();
    state.search = "";
    state.filter = "all";
    location.hash = go.dataset.go;
    return;
  }
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  void guarded(async () => {
    el.disabled = true;
    try {
      await handleAction(el.dataset.action, el.dataset.id, el);
    } finally {
      el.disabled = false;
    }
  });
});
$("#close-dialog").onclick = close;
$("#dialog").addEventListener("click", (event) => {
  if (event.target === $("#dialog")) {
    const r = $("#dialog").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      close();
  }
});
$("#menu").onclick = () => {
  const open = !$("#sidebar").classList.contains("open");
  setMenu(open);
  if (open) $("#main-nav a")?.focus();
};
mobileNavigation.addEventListener("change", () => setMenu(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#sidebar").classList.contains("open")) {
    setMenu(false);
    $("#menu").focus();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (
    $("#sidebar").classList.contains("open") &&
    !event.target.closest("#sidebar, #menu")
  )
    setMenu(false);
});
$("#refresh").onclick = () => void guarded(() => load());
$("#account").onclick = () => (location.hash = "settings");
$("#workspace-info").onclick = () => (location.hash = "settings");
$("#leave-demo").onclick = () => location.assign(location.pathname);
window.addEventListener("hashchange", () => {
  state.page = 0;
  if (state.route !== "companies") state.search = "";
  render();
});

async function openApp(session) {
  state.session = session;
  if (!state.demo) {
    const { data: assurance, error: assuranceError } =
      await state.db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
      const { data: factors, error } = await state.db.auth.mfa.listFactors();
      if (error) throw error;
      mfaFactor = factors.totp.find((f) => f.status === "verified")?.id;
      if (!mfaFactor)
        throw new Error(
          "This account requires MFA. Complete sign-in through the mail portal.",
        );
      $("#login").hidden = true;
      $("#mfa").hidden = false;
      $("#auth-status").textContent = "Enter your authenticator code.";
      return;
    }
    const { data: member, error } = await state.db
      .from("mail_members")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("active", true)
      .maybeSingle();
    if (error || !member)
      throw new Error(
        "This account needs active InstelTech mail team membership.",
      );
    let stored;
    try {
      stored = localStorage.getItem(activityKey());
    } catch {}
    lastActivity = getSessionActivityAt({
      storedActivityAt: stored,
      lastSignInAt: session.user.last_sign_in_at,
    });
    if (isSessionIdle(lastActivity)) {
      await state.db.auth.signOut();
      throw new Error(
        "Your session expired after 30 minutes of inactivity. Sign in again.",
      );
    }
    clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      if (
        !state.demo &&
        state.session &&
        isSessionIdle(lastActivity, Date.now(), SESSION_IDLE_TIMEOUT_MS)
      )
        void state.db.auth.signOut();
    }, 10000);
    $("#user-label").innerHTML =
      `${e(session.user.email)}<small>${e(member.role)} · Marketing workspace</small>`;
  }
  $("#auth").hidden = true;
  $("#app").hidden = false;
  $("#demo-banner").hidden = !state.demo;
  $("#workspace-mode").textContent = state.demo
    ? "Sample workspace"
    : "Team workspace";
  try {
    await load();
  } catch (error) {
    $("#content").innerHTML =
      `<div class="error-box"><strong>The CRM backend is not ready.</strong><p>${e(error.message)}</p><p>Apply the CRM Supabase migration and deploy crm-action. Your existing mailbox is still available.</p><a class="button" href="../mail/">Open mailbox ↗</a></div>`;
  }
  clearInterval(pollTimer);
  if (!state.demo)
    pollTimer = setInterval(() => {
      if (
        !document.hidden &&
        !$("#dialog").open &&
        state.data?.jobs.some((j) => ["queued", "running"].includes(j.status))
      )
        void guarded(() => load(false));
    }, 15000);
}
$("#demo").onclick = () => {
  state.demo = true;
  try {
    state.data =
      JSON.parse(sessionStorage.getItem("instel-crm-demo-v1")) || demoData();
  } catch {
    state.data = demoData();
  }
  void openApp(null);
};
$("#login").onsubmit = (event) => {
  event.preventDefault();
  void guarded(async () => {
    if (!state.db)
      throw new Error(
        "Supabase is unavailable. Check the connection or explore the demo.",
      );
    const b = $("#login button");
    b.disabled = true;
    try {
      const f = new FormData(event.target);
      const { data, error } = await state.db.auth.signInWithPassword({
        email: f.get("email"),
        password: f.get("password"),
      });
      if (error) throw error;
      try {
        localStorage.setItem(
          `insteltech-mail:last-activity:${data.session.user.id}`,
          String(Date.now()),
        );
      } catch {}
      await openApp(data.session);
    } finally {
      b.disabled = false;
    }
  });
};
$("#mfa").onsubmit = (event) => {
  event.preventDefault();
  void guarded(async () => {
    const { error } = await state.db.auth.mfa.challengeAndVerify({
      factorId: mfaFactor,
      code: new FormData(event.target).get("code"),
    });
    if (error) throw error;
    const { data } = await state.db.auth.getSession();
    await openApp(data.session);
  });
};

async function init() {
  try {
    const response = await fetch("./catalog.json");
    if (!response.ok) throw new Error("Workflow catalog could not be loaded.");
    state.catalog = (await response.json()).map((workflow) => ({
      ...workflow,
      mode: "codex",
    }));
  } catch (error) {
    toast(error.message, true);
  }
  if (new URLSearchParams(location.search).get("demo") === "1") {
    $("#demo").click();
    return;
  }
  try {
    if (!window.VITE_SUPABASE_URL || !window.VITE_SUPABASE_ANON_KEY)
      throw new Error(
        "Workspace connection is not configured. You can explore the demo.",
      );
    const { createClient } =
      await import("https://esm.sh/@supabase/supabase-js@2.112.4");
    state.db = createClient(
      window.VITE_SUPABASE_URL,
      window.VITE_SUPABASE_ANON_KEY,
    );
    const { data, error } = await state.db.auth.getSession();
    if (error) throw error;
    if (data.session && !state.demo) await openApp(data.session);
    else $("#auth-status").textContent = "";
    state.db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !state.demo) {
        clearInterval(idleTimer);
        clearInterval(pollTimer);
        state.data = null;
        state.session = null;
        $("#app").hidden = true;
        $("#auth").hidden = false;
        $("#login").hidden = false;
        $("#mfa").hidden = true;
        $("#content").innerHTML = "";
        close();
      }
    });
  } catch (error) {
    $("#auth-status").textContent = error.message;
  }
}
void init();
