import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = await mkdtemp(join(tmpdir(), "brain-ai-"));
process.env.DB_PATH = join(dir, "test.sqlite");
const { cosine } = await import("../src/semantic.js");
const { enrich } = await import("../src/ai.js");
// Auth owns the users table. Load it before the optional digest module.
await import("../src/auth.js");
const { digestText, sendEmail } = await import("../src/digest.js");
const { db } = await import("../src/db.js");
test.after(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});
test("cosine matches aligned/orthogonal vectors", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 2]), 0);
  assert.equal(cosine([1], [1, 2]), 0);
});
test("Ollama adapter validates model output and makes real endpoint-shaped calls", async () => {
  const real = globalThis.fetch,
    requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) });
    return new Response(
      JSON.stringify(
        url.endsWith("/api/chat")
          ? {
              message: {
                content: JSON.stringify({
                  summary: "A concise summary",
                  tags: ["OS"],
                }),
              },
            }
          : { embeddings: [[1, 0, 0]] },
      ),
      { status: 200 },
    );
  };
  try {
    const r = await enrich({ title: "Deadlock", body: "Processes wait" });
    assert.deepEqual(r.embedding, [1, 0, 0]);
    assert.deepEqual(r.tags, ["os"]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].payload.stream, false);
  } finally {
    globalThis.fetch = real;
  }
});
test("digest connects shared tags and sends with stable idempotency key", async () => {
  const notes = [
    { title: "One", body: "A", tags: ["os"], created: Date.now() },
    { title: "Two", body: "B", tags: ["os"], created: Date.now() },
  ];
  assert.match(digestText(notes), /One ↔ Two/);
  let request;
  await sendEmail(
    { to: ["a@example.com"], text: "test" },
    "stable-key",
    async (url, options) => {
      request = { url, ...options };
      return new Response('{"id":"mock"}', { status: 200 });
    },
  );
  assert.equal(request.headers["Idempotency-Key"], "stable-key");
});
