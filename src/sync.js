import { randomUUID } from "node:crypto";
import { db, transaction } from "./db.js";
import { save, get, remove, clean } from "./notes.js";
db.exec(
  `CREATE TABLE IF NOT EXISTS mutations(owner INTEGER NOT NULL,id TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(owner,id));`,
);
export function register({ route, json, body, fail }) {
  route("POST", /^\/api\/sync$/, async (c) => {
    const { changes = [] } = await body(c.req);
    if (!Array.isArray(changes) || changes.length > 50)
      fail(400, "Maximum 50 changes per sync");
    for (const n of changes) {
      if (
        !n ||
        typeof n.id !== "string" ||
        typeof n.mutation !== "string" ||
        !/^[-\w]{1,80}$/.test(n.id) ||
        !/^[-\w]{1,80}$/.test(n.mutation) ||
        !Number.isInteger(n.version) ||
        n.version < 0
      )
        fail(400, "Invalid sync identity/version");
      if (!n.deleted) clean(n);
    }
    const results = transaction(() =>
      changes.map((n) => {
        const cached = db
          .prepare("SELECT response FROM mutations WHERE owner=? AND id=?")
          .get(c.user, n.mutation);
        if (cached) return JSON.parse(cached.response);
        const old = get(n.id, c.user);
        let result;
        // A global ID collision belonging to another account must not be revealed or changed.
        if (!old && db.prepare("SELECT id FROM notes WHERE id=?").get(n.id))
          fail(
            409,
            "ID collision; export your local note and create a new one",
          );
        if ((old && old.version !== n.version) || (!old && n.version !== 0)) {
          if (n.deleted) {
            result = {
              id: n.id,
              mutation: n.mutation,
              conflict: true,
              note: old || null,
              message: "Delete conflicted; current server copy kept",
            };
          } else {
            const copy = save(
              c.user,
              {
                ...n,
                title: String(n.title).slice(0, 175) + " [conflict copy]",
              },
              randomUUID(),
            );
            result = {
              id: n.id,
              mutation: n.mutation,
              conflict: true,
              note: old || null,
              copy,
            };
          }
        } else {
          if (n.deleted) {
            if (old) remove(n.id, c.user);
            result = {
              id: n.id,
              mutation: n.mutation,
              note: get(n.id, c.user) || { ...n, version: 1, deleted: 1 },
            };
          } else
            result = {
              id: n.id,
              mutation: n.mutation,
              note: save(c.user, n, n.id),
            };
        }
        db.prepare("INSERT INTO mutations VALUES(?,?,?)").run(
          c.user,
          n.mutation,
          JSON.stringify(result),
        );
        return result;
      }),
    );
    const notes = db
      .prepare("SELECT * FROM notes WHERE owner=?")
      .all(c.user)
      .map((n) => ({ ...n, tags: JSON.parse(n.tags) }));
    json(c.res, { results, notes });
  });
}
