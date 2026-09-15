import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const container = `instel-crm-db-check-${process.pid}`;
try {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      container,
      "-e",
      "POSTGRES_PASSWORD=crm-test-only",
      "-v",
      `${root}supabase/migrations/20260913090000_create_crm.sql:/tmp/crm-migration.sql:ro`,
      "-v",
      `${root}tests/crm-database.sql:/tmp/crm-tests.sql:ro`,
      "-v",
      `${root}supabase/migrations:/tmp/crm-migrations:ro`,
      "-v",
      `${root}tests/crm-automation-database.sql:/tmp/crm-automation-tests.sql:ro`,
      "postgres:17-alpine",
    ],
    { stdio: "pipe" },
  );
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      execFileSync(
        "docker",
        ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
        { stdio: "pipe" },
      );
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!ready)
    throw new Error("Disposable PostgreSQL instance did not become ready");
  execFileSync(
    "docker",
    ["exec", container, "psql", "-U", "postgres", "-f", "/tmp/crm-tests.sql"],
    { stdio: "pipe" },
  );
  console.log(
    "CRM database tests passed: team authorization, private runner hashes, consent evidence, unique claims, paused campaigns, and opt-out suppression.",
  );
  execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-f",
      "/tmp/crm-automation-tests.sql",
    ],
    { stdio: "pipe" },
  );
  console.log(
    "Automation database tests passed: ordered steps, unique leases, backoff, stale-write holds, cancellation, RLS and scheduler access.",
  );
} catch (error) {
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  try {
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  } catch {}
}
