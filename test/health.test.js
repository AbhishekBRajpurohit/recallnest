import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export async function start(t) {
  const dir = await mkdtemp(join(tmpdir(), "brain-"));
  const child = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "0",
      DB_PATH: join(dir, "test.sqlite"),
      AI_ENABLED: "false",
      RESEND_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (x) => (logs += x));
  t.after(async () => {
    child.kill();
    await new Promise((r) =>
      child.exitCode !== null ? r() : child.once("exit", r),
    );
    await rm(dir, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Startup timeout " + logs)),
      10000,
    );
    child.stdout.on("data", (x) => {
      const m = String(x).match(/READY (\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(Error(logs));
    });
  });
  return "http://127.0.0.1:" + port;
}
test("server serves health and rejects missing API", async (t) => {
  const base = await start(t);
  assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.ok([401, 404].includes((await fetch(base + "/api/nope")).status));
});
