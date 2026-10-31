import test from "node:test";
import assert from "node:assert/strict";
import { start } from "./health.test.js";
const note = (title = "Deadlock") => ({
  title,
  body: "Processes wait for resources",
  url: "https://example.com",
  tags: ["os"],
  folder: "College/OS",
  collection: "Placement",
});
test("accounts, FTS, sync retry/conflicts, sharing and digest preferences", async (t) => {
  const base = await start(t);
  async function call(path, method = "GET", value, cookie = "") {
    const r = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const a = await call("/api/auth/register", "POST", {
    email: "a@example.com",
    password: "password123",
    name: "A",
  });
  assert.equal(a.status, 200);
  const b = await call("/api/auth/register", "POST", {
    email: "b@example.com",
    password: "password123",
    name: "B",
  });
  assert.equal(b.status, 200);
  assert.equal((await call("/api/notes")).status, 401);
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "a@example.com",
        password: "incorrect",
      })
    ).status,
    401,
  );
  const saved = await call("/api/notes", "POST", note(), a.cookie);
  assert.equal(saved.status, 201);
  const id = saved.data.id;
  assert.equal(
    (await call("/api/notes", "GET", undefined, b.cookie)).data.length,
    0,
  );
  assert.equal(
    (await call("/api/notes/" + id, "PUT", note("stolen"), b.cookie)).status,
    404,
  );
  assert.equal(
    (await call("/api/search?q=resources", "GET", undefined, a.cookie)).data
      .length,
    1,
  );
  const mutation = {
    ...saved.data,
    title: "Laptop edit",
    mutation: "first-edit",
  };
  const first = await call(
    "/api/sync",
    "POST",
    { changes: [mutation] },
    a.cookie,
  );
  assert.equal(first.status, 200);
  assert.equal(first.data.results[0].note.version, 2);
  const retry = await call(
    "/api/sync",
    "POST",
    { changes: [mutation] },
    a.cookie,
  );
  assert.deepEqual(retry.data.results, first.data.results);
  const conflict = await call(
    "/api/sync",
    "POST",
    {
      changes: [{ ...saved.data, title: "Phone edit", mutation: "phone-edit" }],
    },
    a.cookie,
  );
  assert.equal(conflict.data.results[0].conflict, true);
  assert.match(conflict.data.results[0].copy.title, /conflict copy/);
  const deletion = await call(
    "/api/sync",
    "POST",
    { changes: [{ ...saved.data, deleted: 1, mutation: "stale-delete" }] },
    a.cookie,
  );
  assert.equal(deletion.data.results[0].conflict, true);
  assert.equal(deletion.data.results[0].note.deleted, 0);
  const shared = await call(
    "/api/shares",
    "POST",
    { collection: "Placement", public: false },
    a.cookie,
  );
  const token = shared.data.token;
  assert.equal((await call("/api/public")).data.length, 0);
  assert.equal((await call("/api/shared/" + token)).data.notes.length, 2);
  await call("/api/shares/" + token, "DELETE", {}, b.cookie);
  assert.equal((await call("/api/shared/" + token)).status, 200);
  await call("/api/shares/" + token, "DELETE", {}, a.cookie);
  assert.equal((await call("/api/shared/" + token)).status, 404);
  assert.equal(
    (await call("/api/semantic?q=waiting", "GET", undefined, a.cookie)).status,
    503,
  );
  await call("/api/digest", "PUT", { enabled: true }, a.cookie);
  const d = (await call("/api/digest", "GET", undefined, a.cookie)).data;
  assert.equal(d.digest_enabled, 1);
  assert.equal(d.configured, false);
  assert.match(d.text, /Laptop edit/);
  const forged = await fetch(base + "/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: a.cookie,
      Origin: "https://evil.example",
    },
    body: JSON.stringify(note()),
  });
  assert.equal(forged.status, 403);
  await call("/api/logout", "POST", {}, a.cookie);
  assert.equal(
    (await call("/api/notes", "GET", undefined, a.cookie)).status,
    401,
  );
});
