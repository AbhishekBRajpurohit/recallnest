import { $, api, status, el, button } from "./ui.js";
import { sync } from "./sync.js";
import {
  openLocal,
  allLocal,
  putLocal,
  localSave,
  localDelete,
  filterLocal,
} from "./local.js";
let editing = null,
  editingNote = null;
$("#workspace").innerHTML =
  `<form id="editor"><h2 id="editor-title">Capture a thought</h2><label>Title<input name="title" required maxlength="200"></label><label>Note<textarea name="body" maxlength="50000"></textarea></label><label>Source URL<input name="url" type="url"></label><div id="extra-fields"></div><button>Save note</button><button type="button" id="cancel" class="secondary">New note</button></form>`;
$("#extra-fields").innerHTML =
  `<div class="row"><label>Tags (comma separated)<input name="tags" maxlength="800"></label><label>Folder path<input name="folder" placeholder="College/OS/Unit 2" maxlength="200"></label><label>Collection<input name="collection" placeholder="Placement preparation" maxlength="100"></label></div>`;
const form = $("#editor");
function reset() {
  editing = null;
  editingNote = null;
  form.reset();
  $("#editor-title").textContent = "Capture a thought";
}
$("#cancel").onclick = reset;
$("#tools").innerHTML =
  `<div class="panel"><label>Search your knowledge<input id="query" placeholder="Search words…"></label><div class="row"><label>Folder and descendants<input id="folder-filter"></label><label>Tag<input id="tag-filter"></label><label>Collection<input id="collection-filter"></label></div><div id="search-actions"></div></div>`;
for (const id of ["query", "folder-filter", "tag-filter", "collection-filter"])
  $("#" + id).oninput = () => render().catch((e) => status(e.message));
async function readNotes() {
  return filterLocal(
    await allLocal(),
    $("#query").value,
    $("#folder-filter").value,
    $("#tag-filter").value,
    $("#collection-filter").value,
  );
}
async function writeNote(note) {
  const n = await localSave(note, editing, editingNote);
  return n;
}
async function deleteNote(note) {
  return localDelete(note);
}

export async function render() {
  const notes = await readNotes();
  $("#notes").replaceChildren();
  for (const n of notes) {
    const card = el("article", undefined, $("#notes"));
    el("h2", n.title, card);
    el("p", n.body, card);
    if (n.summary) {
      el("small", "AI summary — check against the source", card);
      el("p", n.summary, card);
    }
    if (n.ai_error) el("small", "AI pending: " + n.ai_error, card);
    if (n.url) {
      const a = el("a", "View source ↗", card);
      a.href = n.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    el(
      "p",
      [n.folder, n.collection, (n.tags || []).map((t) => "#" + t).join(" ")]
        .filter(Boolean)
        .join(" · "),
      card,
      "meta",
    );
    el("p", new Date(n.updated).toLocaleString(), card, "meta");
    button(
      "Edit",
      () => {
        editing = n.id;
        editingNote = n;
        for (const [k, v] of Object.entries(n)) {
          if (form.elements.namedItem(k))
            form.elements.namedItem(k).value = Array.isArray(v)
              ? v.join(", ")
              : v;
        }
        $("#editor-title").textContent = "Edit note";
        form.scrollIntoView();
      },
      card,
    );
    button(
      "Delete",
      async () => {
        if (confirm("Delete this note?")) {
          await deleteNote(n);
          await render();
          await syncNow();
        }
      },
      card,
    );
  }
  if (!notes.length)
    el("p", "No notes yet. Save your first thought above.", $("#notes"));
}
form.onsubmit = async (e) => {
  e.preventDefault();
  try {
    await writeNote(Object.fromEntries(new FormData(form)));
    reset();
    await render();
    status("Saved on this device.");
    await syncNow();
  } catch (e) {
    status(e.message);
  }
};
async function syncNow() {
  try {
    const result = await sync();
    if (result.busy) return;
    await render();
    status(
      result.conflicts
        ? `Synced with ${result.conflicts} conflict(s). Edited versions were saved as conflict copies; conflicting deletes kept the server version.`
        : result.pending
          ? "New edits remain pending; sync again."
          : "All changes synced.",
    );
  } catch (e) {
    status("Saved locally. Sync unavailable: " + e.message);
  }
}
button("Sync now", syncNow, $("#search-actions"));

const semanticPanel = el("div", undefined, $("#tools"), "panel");
semanticPanel.hidden = true;
button(
  "Search by meaning",
  async () => {
    const result = await api(
      "/api/semantic?q=" + encodeURIComponent($("#query").value),
    );
    semanticPanel.hidden = false;
    semanticPanel.replaceChildren();
    el("h2", "Semantic matches", semanticPanel);
    el(
      "small",
      `${result.indexed} synced, indexed notes · whole workspace`,
      semanticPanel,
    );
    for (const n of result.matches) {
      el("h3", n.title, semanticPanel);
      el("p", n.summary, semanticPanel);
      el(
        "small",
        "Similarity " + n.score.toFixed(3) + " (not a probability)",
        semanticPanel,
      );
      button(
        "Find this note",
        async () => {
          $("#query").value = n.title;
          for (const id of ["folder-filter", "tag-filter", "collection-filter"])
            $("#" + id).value = "";
          await render();
        },
        semanticPanel,
      );
    }
    if (!result.matches.length)
      el("p", "No indexed notes yet. Check AI status and sync.", semanticPanel);
  },
  $("#search-actions"),
);
button(
  "AI status",
  async () => {
    const a = await api("/api/ai-status");
    status(
      `AI ${a.enabled ? "enabled" : "disabled"} · ${a.pending} pending. ` +
        a.errors.map((e) => e.title + ": " + e.ai_error).join("; "),
    );
  },
  $("#search-actions"),
);
button(
  "Server full-text search",
  async () => {
    const matches = await api(
      "/api/search?" +
        new URLSearchParams({
          q: $("#query").value,
          folder: $("#folder-filter").value,
          tag: $("#tag-filter").value,
          collection: $("#collection-filter").value,
        }),
    );
    status(
      "Server FTS matches (synced notes only):\n" +
        (matches.map((n) => n.title).join("\n") || "None"),
    );
  },
  $("#search-actions"),
);
window.addEventListener("online", () => window.currentUser && syncNow());
window.addEventListener("brain-ready", async () => {
  try {
    await openLocal(window.currentUser.id);
    await captureFromHash();
    await render();
    await syncNow();
  } catch (e) {
    status(e.message);
  }
});

async function captureFromHash() {
  if (!location.hash.startsWith("#capture=")) return;
  try {
    const note = JSON.parse(decodeURIComponent(location.hash.slice(9)));
    if (
      typeof note.title !== "string" ||
      typeof note.body !== "string" ||
      !/^https?:\/\//.test(note.url)
    )
      throw Error("Invalid capture");
    await localSave(
      {
        ...note,
        title: note.title.slice(0, 200) || "Untitled page",
        body: note.body.slice(0, 12000),
        folder: "Inbox",
      },
      null,
    );
    history.replaceState(null, "", location.pathname);
    status("Page captured locally.");
  } catch (e) {
    status("Capture failed: " + e.message);
  }
}
window.addEventListener("brain-imported", () =>
  render().catch((e) => status(e.message)),
);
await import("./digest.js");
await import("./backup.js");
await import("./sharing.js");
await import("./auth.js");

if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("/sw.js")
    .catch((e) => status("Offline shell unavailable: " + e.message));
