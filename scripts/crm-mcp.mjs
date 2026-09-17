#!/usr/bin/env node
// A small, scoped stdio MCP server. It exposes named CRM operations, not a shell.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AUTOMATIONS } from "../crm/automation-catalog.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clayReads = new Set([
  "whoami",
  "credits",
  "actions",
  "schema",
  "workflow_get",
  "node_get",
  "tables",
  "table_rows",
]);
export function clayCommand(operation, input = {}) {
  const id = (key) => {
    const value = String(input[key] || "");
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(value))
      throw new Error(`Invalid Clay ${key}`);
    return value;
  };
  switch (operation) {
    case "whoami":
      return ["whoami"];
    case "credits":
      return ["credits"];
    case "actions":
      return ["workflows", "actions", "list"];
    case "schema":
      return [
        "workflows",
        "actions",
        "schema",
        id("package_id"),
        id("action_key"),
      ];
    case "workflow_get":
      return ["workflows", "get", id("workflow_id")];
    case "node_get":
      return ["workflows", "nodes", "get", id("workflow_id"), id("node_id")];
    case "tables":
      return ["tables", "list"];
    case "table_rows":
      return ["tables", "rows", id("table_id")];
    case "create":
      if (
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.length > 200
      )
        throw new Error("Enter a Clay workflow name");
      return ["workflows", "create", "--name", input.name];
    case "node_create":
      return [
        "workflows",
        "nodes",
        "create",
        id("workflow_id"),
        "--input",
        "-",
      ];
    case "node_update":
      return [
        "workflows",
        "nodes",
        "update",
        id("workflow_id"),
        id("node_id"),
        "--input",
        "-",
      ];
    case "publish":
      return ["workflows", "publish", id("workflow_id")];
    case "routine_create": {
      if (
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.length > 200
      )
        throw new Error("Enter a Clay routine name");
      return [
        "routines",
        "create",
        "workflow",
        id("workflow_id"),
        "--name",
        input.name,
      ];
    }
    case "routine_run": {
      if (
        !Array.isArray(input.items) ||
        !input.items.length ||
        input.items.length > 100 ||
        JSON.stringify(input.items).length > 100000
      )
        throw new Error("Supply 1 to 100 Clay input rows, at most 100 KB");
      return [
        "routines",
        "runs",
        "start",
        id("routine_id"),
        "--input",
        JSON.stringify({ items: input.items }),
      ];
    }
    default:
      throw new Error("Unknown Clay operation");
  }
}
async function runClay(operation, input) {
  const args = clayCommand(operation, input);
  return await new Promise((done, fail) => {
    const child = spawn("clay", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...(process.env.CLAY_API_KEY
          ? { CLAY_API_KEY: process.env.CLAY_API_KEY }
          : {}),
      },
    });
    let output = "",
      error = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 45000);
    child.stdout.on("data", (bytes) => {
      output += bytes;
      if (output.length > 500000) child.kill("SIGTERM");
    });
    child.stderr.on("data", (bytes) => {
      error = (error + bytes).slice(-1000);
    });
    child.once("error", () => {
      clearTimeout(timer);
      fail(
        new Error(
          "Clay CLI is unavailable. Install and sign in to Clay on the paired runner computer.",
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) done(output);
      else
        fail(
          new Error(
            `Clay exited ${code}. ${error.replace(/(?:sk-|eyJ)[A-Za-z0-9_.-]+/g, "[redacted]")}`,
          ),
        );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input?.node ? JSON.stringify(input.node) : "");
  });
}
export async function handleTool(name, args, context, fetcher = fetch) {
  if (name === "workflow_reference") {
    const library = resolve(root, "crm/library");
    const path = resolve(library, String(args.path || ""));
    if (
      !path.startsWith(library + sep) ||
      !/\.(md|json|yaml|yml|ts|py)$/.test(path)
    )
      throw new Error(
        "Choose a source reference inside the imported workflow library.",
      );
    return (await readFile(path, "utf8")).slice(0, 100000);
  }
  if (name === "clay") {
    if (!clayReads.has(args.operation) && !context.allow_provider_writes)
      throw new Error("Provider changes are disabled for this job.");
    return await runClay(args.operation, args.input);
  }
  if (name !== "provider_operation") throw new Error("Unknown CRM tool");
  const operation = AUTOMATIONS.find((o) => o.id === args.operation);
  if (!operation) throw new Error("Unknown provider operation");
  if (operation.write && !context.allow_provider_writes)
    throw new Error("Provider changes are disabled for this job.");
  const callId = args.call_id;
  if (typeof callId !== "string" || !/^[a-zA-Z0-9_.:-]{1,150}$/.test(callId))
    throw new Error(
      "Supply a unique call_id; reuse it only to poll the same operation.",
    );
  const response = await fetcher(`${context.url}/functions/v1/crm-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: context.anonKey,
      "x-crm-worker": context.token,
    },
    body: JSON.stringify({
      action: "provider_operation",
      job_id: context.job_id,
      call_id: callId,
      operation: args.operation,
      input: args.input,
    }),
    signal: AbortSignal.timeout(55000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `CRM returned HTTP ${response.status}`);
  return JSON.stringify(data);
}
export function toolDefinitions(allowWrites) {
  return [
    {
      name: "provider_operation",
      description: `Run an actual CRM provider operation. Operations: ${AUTOMATIONS.filter(
        (o) => allowWrites || !o.write,
      )
        .map((o) => `${o.id} (${o.fields.map((f) => `${f.key}: ${f.label}${f.required ? " [required]" : " [optional]"}`).join(", ")})`)
        .join(
          "; ",
        )}. Calls are saved in CRM history. Use a unique call_id per operation, and the same ID and inputs when polling/retrying. Do not create a new ID to replay a held write.`,
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: AUTOMATIONS.filter((o) => allowWrites || !o.write).map(
              (o) => o.id,
            ),
          },
          input: { type: "object" },
          call_id: { type: "string" },
        },
        required: ["operation", "input", "call_id"],
        additionalProperties: false,
      },
    },
    {
      name: "workflow_reference",
      description:
        "Read an imported workflow's supporting references, scripts, schemas and Clay node graphs. Paths are relative to crm/library, for example skills/playbooks/playbook-fundraising/clay-workflow.md.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "clay",
      description:
        "Execute the Clay CLI on the paired computer. Read the imported Clay harness, discover the action schema, then build nodes using their real workspace schema. Node writes take input.node. To execute a published workflow use routine_create (workflow_id, name), then routine_run (routine_id, items array). Requires Clay CLI authentication on the runner. Never retry an interrupted write without reconciling its outcome.",
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: [
              ...clayReads,
              ...(allowWrites
                ? [
                    "create",
                    "node_create",
                    "node_update",
                    "publish",
                    "routine_create",
                    "routine_run",
                  ]
                : []),
            ],
          },
          input: { type: "object" },
        },
        required: ["operation", "input"],
        additionalProperties: false,
      },
    },
  ];
}
async function main() {
  const context = JSON.parse(
    await readFile(process.env.INSTEL_CRM_CONTEXT, "utf8"),
  );
  const url = new URL(context.url);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/"
  )
    throw new Error("Invalid CRM project URL");
  context.url = url.origin;
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }
    if (request.id === undefined) continue;
    let result;
    try {
      if (request.method === "initialize")
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "instel-crm", version: "1.0.0" },
        };
      else if (request.method === "ping") result = {};
      else if (request.method === "tools/list")
        result = { tools: toolDefinitions(context.allow_provider_writes) };
      else if (request.method === "tools/call")
        result = {
          content: [
            {
              type: "text",
              text: await handleTool(
                request.params.name,
                request.params.arguments || {},
                context,
              ),
            },
          ],
        };
      else {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: "Method not found" },
          }) + "\n",
        );
        continue;
      }
    } catch (error) {
      result = {
        isError: true,
        content: [{ type: "text", text: error.message }],
      };
    }
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n",
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
