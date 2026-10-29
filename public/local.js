// One IndexedDB database per account. Local data stays on this browser.
let database;
export async function openLocal(owner) {
  database = await new Promise((resolve, reject) => {
    const r = indexedDB.open("second-brain-" + owner, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("notes", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function run(mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction("notes", mode);
    const request = operation(tx.objectStore("notes"));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("Local write aborted"));
  });
}
export const allLocal = () => run("readonly", (s) => s.getAll());
export const putLocal = (n) => run("readwrite", (s) => s.put(n));
export const getLocal = (id) => run("readonly", (s) => s.get(id));
// The read and replacement happen in one IndexedDB transaction, including across tabs.
export function changeLocal(id, fn) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction("notes", "readwrite"),
      store = tx.objectStore("notes");
    let result;
    const r = store.get(id);
    r.onsuccess = () => {
      try {
        result = fn(r.result);
        if (result) store.put(result);
      } catch (e) {
        tx.abort();
        reject(e);
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}
export async function localSave(input, id, base = null) {
  const title = String(input.title || "").trim(),
    body = String(input.body || ""),
    url = String(input.url || ""),
    collection = String(input.collection || "").trim();
  const tags = [
    ...new Set(
      (Array.isArray(input.tags)
        ? input.tags
        : String(input.tags || "").split(",")
      )
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const folder = String(input.folder || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
  if (
    !title ||
    title.length > 200 ||
    body.length > 50000 ||
    url.length > 2000 ||
    (url && !/^https?:\/\//i.test(url)) ||
    tags.length > 20 ||
    tags.some((t) => t.length > 40) ||
    folder.length > 200 ||
    collection.length > 100
  )
    throw Error(
      "Check note fields: title 1–200, body up to 50000, HTTP(S) URL, up to 20 short tags.",
    );
  return changeLocal(id || crypto.randomUUID(), (old) => {
    const conflict =
      base &&
      old &&
      (old.version !== base.version || old.mutation !== base.mutation);
    const previous = conflict ? null : old;
    return {
      ...previous,
      summary: "",
      ai_error: "",
      title: conflict ? title.slice(0, 175) + " [local conflict copy]" : title,
      body,
      url,
      tags,
      folder,
      collection,
      id: previous?.id || crypto.randomUUID(),
      version: previous?.version || 0,
      created: previous?.created || Date.now(),
      updated: Date.now(),
      deleted: 0,
      dirty: true,
      mutation: crypto.randomUUID(),
    };
  });
}
export async function localDelete(note) {
  return changeLocal(note.id, (current) => {
    if (!current) return;
    if (current.version !== note.version || current.mutation !== note.mutation)
      throw Error("Note changed in another tab. Refresh before deleting.");
    return {
      ...current,
      deleted: 1,
      dirty: true,
      mutation: crypto.randomUUID(),
      updated: Date.now(),
    };
  });
}
export function filterLocal(notes, q, folder, tag, collection) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return notes
    .filter(
      (n) =>
        !n.deleted &&
        words.every((w) =>
          (n.title + " " + n.body + " " + n.tags.join(" "))
            .toLowerCase()
            .includes(w),
        ) &&
        (!folder || n.folder === folder || n.folder.startsWith(folder + "/")) &&
        (!tag || n.tags.includes(tag)) &&
        (!collection || n.collection === collection),
    )
    .sort((a, b) => b.updated - a.updated);
}
