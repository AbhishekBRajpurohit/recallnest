import { randomUUID } from "node:crypto";
import { db, column } from "./db.js";
column("notes", "tags", "TEXT NOT NULL DEFAULT '[]'");
column("notes", "folder", "TEXT NOT NULL DEFAULT ''");
column("notes", "collection", "TEXT NOT NULL DEFAULT ''");
const decode = (n) => (n ? { ...n, tags: JSON.parse(n.tags) } : n);
export function clean(input) {
  if (!input || typeof input !== "object")
    throw Object.assign(Error("Note required"), { status: 400 });
  const title = String(input.title || "").trim(),
    body = String(input.body || ""),
    url = String(input.url || "");
  if (!title || title.length > 200 || body.length > 50000 || url.length > 2000)
    throw Object.assign(
      Error("Title required (max 200); body max 50000; URL max 2000"),
      { status: 400 },
    );
  if (url && !/^https?:\/\//i.test(url))
    throw Object.assign(Error("Use an http(s) source URL"), { status: 400 });

  const tags = (
    Array.isArray(input.tags) ? input.tags : String(input.tags || "").split(",")
  )
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
  const folder = String(input.folder || "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .join("/"),
    collection = String(input.collection || "").trim();
  if (
    tags.length > 20 ||
    tags.some((t) => t.length > 40) ||
    folder.length > 200 ||
    collection.length > 100
  )
    throw Object.assign(Error("Too many tags or long folder/collection"), {
      status: 400,
    });
  return { title, body, url, tags: [...new Set(tags)], folder, collection };
}
export function list(owner) {
  return db
    .prepare(
      "SELECT * FROM notes WHERE owner=? AND deleted=0 ORDER BY updated DESC",
    )
    .all(owner)
    .map(decode);
}
export function get(id, owner) {
  return decode(
    db.prepare("SELECT * FROM notes WHERE id=? AND owner=?").get(id, owner),
  );
}
export function save(owner, input, id = randomUUID()) {
  const n = clean(input),
    old = get(id, owner),
    now = Date.now();
  if (old) {
    db.prepare(
      "UPDATE notes SET title=?,body=?,url=?,version=version+1,updated=? WHERE id=? AND owner=?",
    ).run(n.title, n.body, n.url, now, id, owner);
  } else {
    db.prepare(
      "INSERT INTO notes(id,owner,title,body,url,created,updated) VALUES(?,?,?,?,?,?,?)",
    ).run(id, owner, n.title, n.body, n.url, now, now);
  }
  db.prepare(
    "UPDATE notes SET tags=?,folder=?,collection=? WHERE id=? AND owner=?",
  ).run(JSON.stringify(n.tags), n.folder, n.collection, id, owner);
  return get(id, owner);
}
export function remove(id, owner) {
  db.prepare(
    "UPDATE notes SET deleted=1,version=version+1,updated=? WHERE id=? AND owner=?",
  ).run(Date.now(), id, owner);
}
export function register({ route, json, body, fail }) {
  route("GET", /^\/api\/notes$/, async (c) => json(c.res, list(c.user)));
  route("POST", /^\/api\/notes$/, async (c) =>
    json(c.res, save(c.user, await body(c.req)), 201),
  );
  route("PUT", /^\/api\/notes\/([\w-]+)$/, async (c) => {
    if (!get(c.match[1], c.user)) fail(404, "Note not found");
    json(c.res, save(c.user, await body(c.req), c.match[1]));
  });
  route("DELETE", /^\/api\/notes\/([\w-]+)$/, async (c) => {
    if (!get(c.match[1], c.user)) fail(404, "Note not found");
    remove(c.match[1], c.user);
    json(c.res, { ok: true });
  });
}
