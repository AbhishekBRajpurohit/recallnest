import { db } from "./db.js";
import { list } from "./notes.js";
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(title,body,tags,content='notes',content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN INSERT INTO note_fts(rowid,title,body,tags) VALUES(new.rowid,new.title,new.body,new.tags); END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN INSERT INTO note_fts(note_fts,rowid,title,body,tags) VALUES('delete',old.rowid,old.title,old.body,old.tags); END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN INSERT INTO note_fts(note_fts,rowid,title,body,tags) VALUES('delete',old.rowid,old.title,old.body,old.tags); INSERT INTO note_fts(rowid,title,body,tags) VALUES(new.rowid,new.title,new.body,new.tags); END;
INSERT INTO note_fts(note_fts) VALUES('rebuild');`);
export function register({ route, json }) {
  route("GET", /^\/api\/search$/, async (c) => {
    const q = (c.url.searchParams.get("q") || "").slice(0, 300),
      words = q.match(/[\p{L}\p{N}_]+/gu) || [];
    const ids = words.length
      ? new Set(
          db
            .prepare(
              "SELECT notes.id FROM note_fts JOIN notes ON notes.rowid=note_fts.rowid WHERE note_fts MATCH ? AND notes.owner=? AND notes.deleted=0 ORDER BY rank LIMIT 200",
            )
            .all(words.map((w) => '"' + w + '"*').join(" AND "), c.user)
            .map((n) => n.id),
        )
      : null;
    json(
      c.res,
      list(c.user).filter(
        (n) =>
          (!ids || ids.has(n.id)) &&
          (!c.url.searchParams.get("tag") ||
            n.tags.includes(c.url.searchParams.get("tag"))) &&
          (!c.url.searchParams.get("folder") ||
            n.folder === c.url.searchParams.get("folder") ||
            n.folder.startsWith(c.url.searchParams.get("folder") + "/")) &&
          (!c.url.searchParams.get("collection") ||
            n.collection === c.url.searchParams.get("collection")),
      ),
    );
  });
}
