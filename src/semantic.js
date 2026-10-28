import { db } from "./db.js";
import { embed, embeddingModel } from "./ai.js";
export function cosine(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function register({ route, json, fail }) {
  route("GET", /^\/api\/semantic$/, async (c) => {
    const q = (c.url.searchParams.get("q") || "").trim();
    if (!q || q.length > 500) fail(400, "Query must have 1–500 characters");
    if (process.env.AI_ENABLED !== "true") fail(503, "Enable Ollama AI first");
    let vector;
    try {
      vector = await embed(q);
    } catch {
      fail(503, "Embedding service unavailable; try keyword search");
    }
    const notes = db
      .prepare(
        "SELECT id,title,summary,embedding FROM notes WHERE owner=? AND deleted=0 AND ai_version=version AND embedding_model=?",
      )
      .all(c.user, embeddingModel());
    const matches = notes
      .map((n) => ({
        id: n.id,
        title: n.title,
        summary: n.summary,
        score: cosine(vector, JSON.parse(n.embedding)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    json(c.res, { indexed: notes.length, matches });
  });
}
