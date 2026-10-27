import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const path = process.env.DB_PATH || "data/brain.sqlite";
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
);
db.exec(
  `CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, owner INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);`,
);
export function column(table, name, definition) {
  if (
    !db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === name)
  )
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
