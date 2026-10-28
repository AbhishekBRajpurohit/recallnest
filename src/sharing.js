import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { list } from "./notes.js";
db.exec(
  `CREATE TABLE IF NOT EXISTS shares(token TEXT PRIMARY KEY,owner INTEGER NOT NULL,collection TEXT NOT NULL,public INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,UNIQUE(owner,collection));`,
);
export function register({ route, json, body, fail }) {
  route("GET", /^\/api\/shares$/, async (c) =>
    json(
      c.res,
      db
        .prepare("SELECT token,collection,public FROM shares WHERE owner=?")
        .all(c.user),
    ),
  );
  route("POST", /^\/api\/shares$/, async (c) => {
    const b = await body(c.req),
      collection = String(b.collection || "").trim();
    if (!collection || collection.length > 100)
      fail(400, "Collection required");
    if (!list(c.user).some((n) => n.collection === collection))
      fail(400, "Save a note in this collection first");
    const old = db
      .prepare("SELECT token FROM shares WHERE owner=? AND collection=?")
      .get(c.user, collection);
    const token = old?.token || randomBytes(24).toString("hex");
    db.prepare(
      "INSERT INTO shares VALUES(?,?,?,?,?) ON CONFLICT(owner,collection) DO UPDATE SET public=excluded.public",
    ).run(token, c.user, collection, b.public === true ? 1 : 0, Date.now());
    json(c.res, { token });
  });
  route("DELETE", /^\/api\/shares\/([a-f0-9]+)$/, async (c) => {
    db.prepare("DELETE FROM shares WHERE token=? AND owner=?").run(
      c.match[1],
      c.user,
    );
    json(c.res, { ok: true });
  });
  route("GET", /^\/api\/public$/, async (c) =>
    json(
      c.res,
      db
        .prepare(
          "SELECT token,collection FROM shares WHERE public=1 ORDER BY created DESC LIMIT 100",
        )
        .all(),
    ),
  );
  route("GET", /^\/api\/shared\/([a-f0-9]+)$/, async (c) => {
    const share = db
      .prepare("SELECT * FROM shares WHERE token=?")
      .get(c.match[1]);
    if (!share) fail(404, "Link missing or revoked");
    json(c.res, {
      collection: share.collection,
      notes: list(share.owner)
        .filter((n) => n.collection === share.collection)
        .map(({ title, body, url, tags }) => ({ title, body, url, tags })),
    });
  });
}
