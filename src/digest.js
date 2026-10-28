import { db, column } from "./db.js";
import { list } from "./notes.js";
column("users", "digest_enabled", "INTEGER NOT NULL DEFAULT 0");
column("users", "digest_next", "INTEGER NOT NULL DEFAULT 0");
db.exec(
  `CREATE TABLE IF NOT EXISTS deliveries(owner INTEGER NOT NULL,due INTEGER NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',retry INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',PRIMARY KEY(owner,due));`,
);
export function digestText(notes, now = Date.now()) {
  const recent = notes.filter((n) => n.created >= now - 7 * 86400000),
    groups = new Map();
  for (const n of recent)
    for (const tag of n.tags) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(n.title);
    }
  const connections = [...groups]
    .filter(([, names]) => names.length > 1)
    .slice(0, 8)
    .map(([tag, names]) => `#${tag}: ${names.join(" ↔ ")}`);
  return (
    `Your week in Second Brain\n\n${recent.length} notes saved in the last seven days.\n\n` +
    recent
      .map(
        (n) =>
          `${n.title}\n${n.summary || n.body.slice(0, 250)}${n.url ? "\n" + n.url : ""}`,
      )
      .join("\n\n") +
    "\n\nConnections through shared tags\n" +
    (connections.join("\n") || "No shared-tag connections this week.") +
    "\n\nDisable weekly email in your Second Brain digest settings."
  );
}
export async function sendEmail(payload, key, fetcher = fetch) {
  const r = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Email provider returned " + r.status);
  return r.json();
}
let busy = false;
export async function work() {
  if (busy || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;
  busy = true;
  try {
    const now = Date.now(),
      u = db
        .prepare(
          "SELECT * FROM users WHERE digest_enabled=1 AND digest_next<=? ORDER BY digest_next LIMIT 1",
        )
        .get(now);
    if (!u) return;
    let job = db
      .prepare("SELECT * FROM deliveries WHERE owner=? AND due=?")
      .get(u.id, u.digest_next);
    if (!job) {
      const payload = {
        from: process.env.EMAIL_FROM,
        to: [u.email],
        subject: "Your weekly Second Brain digest",
        text: digestText(list(u.id), now),
      };
      db.prepare("INSERT INTO deliveries(owner,due,payload) VALUES(?,?,?)").run(
        u.id,
        u.digest_next,
        JSON.stringify(payload),
      );
      job = db
        .prepare("SELECT * FROM deliveries WHERE owner=? AND due=?")
        .get(u.id, u.digest_next);
    }
    if (job.state !== "pending" || job.retry > now) return;
    // Bound retries to the provider's idempotency window. Ambiguous old deliveries need operator review.
    if (job.retry && now - job.due > 23 * 3600000) {
      db.prepare(
        "UPDATE deliveries SET state='review',error='Retry window ended; inspect provider delivery logs' WHERE owner=? AND due=?",
      ).run(u.id, u.digest_next);
      return;
    }
    try {
      await sendEmail(
        JSON.parse(job.payload),
        `brain-${u.id}-${u.digest_next}`,
      );
      db.prepare(
        "UPDATE deliveries SET state='sent',error='' WHERE owner=? AND due=?",
      ).run(u.id, u.digest_next);
      db.prepare("UPDATE users SET digest_next=? WHERE id=?").run(
        now + 7 * 86400000,
        u.id,
      );
    } catch (e) {
      db.prepare(
        "UPDATE deliveries SET retry=?,error=? WHERE owner=? AND due=?",
      ).run(now + 10 * 60000, e.message, u.id, u.digest_next);
    }
  } finally {
    busy = false;
  }
}
export function register({ route, json, body }) {
  route("GET", /^\/api\/digest$/, async (c) => {
    const u = db
      .prepare("SELECT digest_enabled,digest_next FROM users WHERE id=?")
      .get(c.user);
    json(c.res, {
      ...u,
      configured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      text: digestText(list(c.user)),
      delivery: db
        .prepare(
          "SELECT state,error FROM deliveries WHERE owner=? ORDER BY due DESC LIMIT 1",
        )
        .get(c.user),
    });
  });
  route("PUT", /^\/api\/digest$/, async (c) => {
    const b = await body(c.req),
      old = db
        .prepare("SELECT digest_enabled,digest_next FROM users WHERE id=?")
        .get(c.user);
    const enabled = b.enabled === true ? 1 : 0;
    db.prepare(
      "UPDATE users SET digest_enabled=?,digest_next=? WHERE id=?",
    ).run(
      enabled,
      enabled && !old.digest_enabled
        ? Date.now() + 7 * 86400000
        : old.digest_next,
      c.user,
    );
    json(c.res, { ok: true });
  });
  const timer = setInterval(() => work().catch(console.error), 60000);
  timer.unref();
}
