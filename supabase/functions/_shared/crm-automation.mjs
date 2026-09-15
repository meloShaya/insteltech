import { AUTOMATIONS } from "../../../crm/automation-catalog.mjs";
import { executeProvider, ProviderError } from "./crm-adapters.mjs";
import { advanceMarket } from "./crm-market.mjs";
import { executeCRMOperation } from "./crm-native.mjs";

export function validatePlan(steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > 100)
    throw new Error("Choose between 1 and 100 automation steps.");
  if (JSON.stringify(steps).length > 400000)
    throw new Error(
      "Automation inputs exceed 400 KB; split the job into batches.",
    );
  return steps.map((step, index) => {
    const operation = AUTOMATIONS.find((o) => o.id === step.operation);
    if (
      !operation ||
      !step.input ||
      typeof step.input !== "object" ||
      Array.isArray(step.input)
    )
      throw new Error(`Invalid operation at step ${index + 1}.`);
    // Resolve only completed earlier steps. No arbitrary expressions, environment access or eval.
    walk(step.input, (value) => {
      if (Object.hasOwn(value, "$step")) {
        if (
          !Number.isInteger(value.$step) ||
          value.$step < 0 ||
          value.$step >= index ||
          typeof value.path !== "string" ||
          !/^[a-zA-Z0-9_.]*$/.test(value.path)
        )
          throw new Error(`Invalid result reference at step ${index + 1}.`);
      }
    });
    return {
      operation: operation.id,
      input: step.input,
      is_write: operation.write,
    };
  });
}
function walk(value, visit) {
  if (value && typeof value === "object") {
    visit(value);
    for (const child of Object.values(value)) walk(child, visit);
  }
}
export function resolveInput(input, outputs) {
  if (!input || typeof input !== "object") return input;
  if (Object.hasOwn(input, "$step")) {
    let result = outputs[input.$step];
    for (const part of input.path.split(".").filter(Boolean)) {
      if (
        ["__proto__", "prototype", "constructor"].includes(part) ||
        result == null ||
        !Object.hasOwn(result, part)
      )
        throw new Error(`Earlier step did not return ${input.path}.`);
      result = result[part];
    }
    if (result === undefined) throw new Error("Earlier step has no result.");
    return result;
  }
  if (Array.isArray(input)) return input.map((v) => resolveInput(v, outputs));
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      resolveInput(value, outputs),
    ]),
  );
}
export function retryOutcome(error, attempts, maximum) {
  if (error.uncertain) return { status: "held", delay: 0 };
  if (error.retryable && attempts < maximum)
    return {
      status: "queued",
      delay: Math.max(
        error.retryAfter || 0,
        Math.min(3600, 30 * 2 ** (attempts - 1)),
      ),
    };
  return { status: "failed", delay: 0 };
}
const checked = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
/** @param {any} db @param {{runId?: string|null, secrets: (key:string)=>string|undefined, fetcher?: typeof fetch}} options */
export async function executeNext(
  db,
  { runId = null, secrets, fetcher = fetch },
) {
  const step = checked(
    await db.rpc("crm_claim_automation", { p_run: runId }),
  )?.[0];
  if (!step) return { idle: true };
  let outcome,
    output = null,
    errorMessage = null;
  const run = checked(
    await db
      .from("crm_automation_runs")
      .select("*")
      .eq("id", step.run_id)
      .single(),
  );
  try {
    if (run.status === "cancelled")
      throw new ProviderError("Run was cancelled before provider execution.");
    const member = checked(
      await db
        .from("mail_members")
        .select("user_id")
        .eq("user_id", run.created_by)
        .eq("active", true)
        .maybeSingle(),
    );
    if (!member)
      throw new ProviderError(
        "The user who queued this run no longer has workspace access.",
      );
    const earlier = checked(
      await db
        .from("crm_automation_steps")
        .select("position,output")
        .eq("run_id", step.run_id)
        .eq("status", "completed"),
    );
    const input = resolveInput(
      step.input,
      Object.fromEntries(earlier.map((s) => [s.position, s.output])),
    );
    if (step.operation.endsWith(".leads")) {
      const emails = (input.leads || []).map((l) =>
        String(l.email || "")
          .trim()
          .toLowerCase(),
      );
      const suppressed = checked(
        await db
          .from("crm_contacts")
          .select("email")
          .in("email", emails)
          .eq("suppressed", true),
      );
      if (suppressed.length)
        throw new ProviderError(
          "This upload contains suppressed CRM contacts. Remove them before uploading.",
        );
    }
    if (step.operation.startsWith("crm.")) {
      output = await executeCRMOperation(
        db,
        step.operation,
        input,
        run.created_by,
        { secrets, fetcher },
      );
    } else if (step.operation === "market.expand") {
      const progress = await advanceMarket(
        input,
        step.checkpoint,
        (operation, args) =>
          executeProvider(operation, args, { secrets, fetcher }),
      );
      output = progress.output;
      if (JSON.stringify(progress).length > 2500000)
        throw new ProviderError(
          "Expansion evidence exceeds the result limit. Use a smaller company batch.",
        );
      if (!progress.done) {
        const accepted = checked(
          await db.rpc("crm_checkpoint_automation", {
            p_step: step.id,
            p_lease: step.lease_id,
            p_checkpoint: progress.checkpoint,
            p_output: progress.output,
          }),
        );
        return {
          run_id: step.run_id,
          step_id: step.id,
          status: "queued",
          progress: progress.output.data.phase,
          accepted,
        };
      }
    } else
      output = await executeProvider(step.operation, input, {
        secrets,
        fetcher,
      });
    if (run.campaign_id) {
      const patch = {};
      if (step.operation.endsWith(".create") && output.resource_id)
        patch.provider_campaign_id = String(output.resource_id);
      if (step.operation.endsWith(".status"))
        patch.status = ["START", "activate"].includes(input.status)
          ? "active"
          : "paused";
      if (Object.keys(patch).length) {
        const update = await db
          .from("crm_campaigns")
          .update(patch)
          .eq("id", run.campaign_id);
        if (update.error)
          throw new ProviderError(
            "Provider accepted the operation but CRM synchronization failed. The saved provider result must be reconciled.",
            { uncertain: true },
          );
      }
    }
    if (JSON.stringify(output).length > 1500000)
      throw new ProviderError(
        "Provider result exceeds 1.5 MB. Reduce the batch size.",
        { uncertain: step.is_write },
      );
    outcome = { status: "completed", delay: 0 };
  } catch (error) {
    outcome = retryOutcome(error, step.attempts, run.max_attempts);
    errorMessage = error.message;
  }
  const accepted = checked(
    await db.rpc("crm_finish_automation", {
      p_step: step.id,
      p_lease: step.lease_id,
      p_status: outcome.status,
      p_output: output,
      p_error: errorMessage,
      p_delay: outcome.delay,
    }),
  );
  return {
    run_id: step.run_id,
    step_id: step.id,
    status: outcome.status,
    accepted,
  };
}
