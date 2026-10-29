import { api } from "./ui.js";
import { allLocal, changeLocal, putLocal } from "./local.js";
let running = false;
export async function sync() {
  if (navigator.locks)
    return navigator.locks.request(
      "brain-sync-" + window.currentUser.id,
      performSync,
    );
  return performSync();
}
async function performSync() {
  if (running) return { busy: true };
  running = true;
  let conflicts = 0;
  try {
    const pending = (await allLocal()).filter((n) => n.dirty);
    // Small batches keep large note bodies below the server request limit.
    const batches = pending.length ? pending.map((n) => [n]) : [[]];
    for (const changes of batches) {
      const result = await api("/api/sync", "POST", { changes });
      for (const r of result.results) {
        if (r.conflict) conflicts++;
        if (r.copy)
          await changeLocal(r.copy.id, (current) =>
            current?.dirty ? current : { ...r.copy, dirty: false },
          );
        await changeLocal(r.id, (current) => {
          if (current?.mutation === r.mutation)
            return r.note
              ? { ...r.note, dirty: false }
              : { ...current, deleted: 1, dirty: false };
          if (current?.dirty && r.note)
            return { ...current, version: r.note.version };
          return current;
        });
      }
      for (const n of result.notes)
        await changeLocal(n.id, (local) =>
          local?.dirty ? local : { ...n, dirty: false },
        );
    }
    return {
      conflicts,
      pending: (await allLocal()).filter((n) => n.dirty).length,
    };
  } finally {
    running = false;
  }
}
