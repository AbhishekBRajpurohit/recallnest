import { $, api, status, el, button } from "./ui.js";
import { sync } from "./sync.js";
import {
  openLocal,
  allLocal,
  putLocal,
  localSave,
  localDelete,
  filterLocal,
  readingStats,
} from "./local.js";
let editing = null,
  editingNote = null;
$("#workspace").innerHTML =
  `<form id="editor"><h2 id="editor-title">Capture a thought</h2><label>Title<input name="title" required maxlength="200"></label><label>Note<textarea name="body" maxlength="50000"></textarea></label><label>Source URL<input name="url" type="url"></label><div id="extra-fields"></div><button>Save note</button><button type="button" id="cancel" class="secondary">New note</button></form>`;
$("#extra-fields").innerHTML =
  `<div class="row"><label>Tags (comma separated)<input name="tags" maxlength="800"></label><label>Folder path<input name="folder" placeholder="College/OS/Unit 2" maxlength="200"></label><label>Collection<input name="collection" placeholder="Placement preparation" maxlength="100"></label></div>`;
form.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();

    if (!event.repeat && !event.isComposing) {
      form.requestSubmit();
    }
  }
});
const bodyField = form.elements.namedItem("body");
const bodyCount = $("#body-count");
function updateBodyCount() {
  const max = bodyField.maxLength;
  bodyCount.textContent = `${bodyField.value.length.toLocaleString()} / ${max.toLocaleString()} characters`;
}
bodyField.addEventListener("input", updateBodyCount);
updateBodyCount();
function reset() {
  editing = null;
  editingNote = null;
  form.reset();
  clearDraft();
  updateBodyCount();
  $("#editor-title").textContent = "Capture a thought";
}
$("#cancel").onclick = () => {
  reset();
  form.elements.namedItem("title").focus();
};
const DRAFT_KEY = "second-brain-draft";
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch { }
}
form.addEventListener("input", () => {
  if (editing) return;
  try {
    const draft = Object.fromEntries(new FormData(form));
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { }
});
try {
  const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
  if (draft) {
    for (const [name, value] of Object.entries(draft))
      if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
    status("Restored your unsaved draft.");
  }
} catch { }
$("#tools").innerHTML =
  `<div class="panel"><label>Search your knowledge<input id="query" placeholder="Search words…"></label><div class="row"><label>Folder and descendants<input id="folder-filter"></label><label>Tag<input id="tag-filter"></label><label>Collection<input id="collection-filter"></label></div><label>Updated<select id="date-filter"><option value="0">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label><div id="search-actions"></div></div>`;
for (const id of ["query", "folder-filter", "tag-filter", "collection-filter"])
  $("#" + id).oninput = () => render().catch((e) => status(e.message));
$("#date-filter").onchange = () => render().catch((e) => status(e.message));
$("#query").addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.target.value = "";
  render().catch((err) => status(err.message));
});
const tagOptions = el("datalist", undefined, $("#tools"));
tagOptions.id = "tag-options";
$("#tag-filter").setAttribute("list", "tag-options");
async function refreshTagOptions() {
  const tags = new Set();
  for (const n of await allLocal())
    if (!n.deleted) for (const t of n.tags || []) tags.add(t);
  tagOptions.replaceChildren(
    ...[...tags].sort().map((t) => {
      const option = document.createElement("option");
      option.value = t;
      return option;
    }),
  );
}
async function readNotes() {
  const days = Number($("#date-filter").value);
  const notes = await readMatchingNotes();
  if (!days) return notes;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return notes.filter((n) => n.updated >= cutoff);
}

async function writeNote(note) {
  const n = await localSave(note, editing, editingNote);
  return n;
}
async function deleteNote(note) {
  return localDelete(note);
}

function highlight(parent, text) {
  const words = $("#query").value.split(/\s+/).filter(Boolean);
  if (!words.length) {
    parent.textContent = text;
    return parent;
  }
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  for (const [i, part] of text.split(pattern).entries())
    if (i % 2) el("mark", part, parent);
    else parent.append(part);
  return parent;
}

export async function render() {
  const notes = await readNotes();
  await refreshTagOptions();

  let noteCount = $("#note-count");
  if (!noteCount) {
    noteCount = el("p", "", $("#tools"), "meta");
    noteCount.id = "note-count";
    noteCount.setAttribute("role", "status");
  }

  noteCount.textContent =
    `${notes.length} ${notes.length === 1 ? "note" : "notes"} shown`;

  $("#notes").replaceChildren();
  for (const n of notes) {
    const card = el("article", undefined, $("#notes"));
    highlight(el("h2", undefined, card), n.title);
    highlight(el("p", undefined, card), n.body);
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
    const place = [n.folder, n.collection].filter(Boolean).join(" · ");
    if (place) el("p", place, card, "meta");
    if ((n.tags || []).length) {
      const chips = el("div", undefined, card, "chips");
      for (const tag of n.tags) {
        const chip = button(
          "#" + tag,
          async () => {
            $("#tag-filter").value = tag;
            await render();
            $("#tag-filter").focus();
          },
          chips,
        );
        chip.className = "chip secondary";
        chip.title = `Show notes tagged ${tag}`;
      }
    }
    el(
      "p",
      `${new Date(n.updated).toLocaleString()} · ${readingStats(n.body).label}`,
      card,
      "meta",
    );
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
      "Copy",
      async () => {
        await navigator.clipboard.writeText(`${n.title}\n\n${n.body}`);
        status(`Copied "${n.title}" to the clipboard.`);
      },
      card,
    );
    button(
      "Delete",
      async () => {
        if (confirm(`Delete "${n.title}"? This will remove it from your notes.`)) {
          await deleteNote(n);
          await render();
          await syncNow();
        }
      },
      card,
    );
  }
  if (!notes.length) {
    const hasFilters = [
      "query",
      "folder-filter",
      "tag-filter",
      "collection-filter",
    ].some((id) => $("#" + id).value.trim() !== "");

    el(
      "p",
      hasFilters
        ? "No notes match your filters. Try another search or clear the filters."
        : "No notes yet. Save your first thought above.",
      $("#notes"),
    );
  }
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
button(
  "Clear filters",
  async () => {
    for (const id of ["query", "folder-filter", "tag-filter", "collection-filter"]) {

      await render();
      $("#query").focus();
    },
    $("#search-actions"),
);

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
button(
  "Export as Markdown",
  async () => {
    const notes = await readNotes();
    if (!notes.length) return status("Nothing to export.");
    const text = notes
      .map((n) =>
        [
          `# ${n.title}`,
          n.url ? `Source: ${n.url}` : "",
          [n.folder, n.collection, (n.tags || []).map((t) => "#" + t).join(" ")]
            .filter(Boolean)
            .join(" · "),
          "",
          n.body,
        ]
          .filter((line, i) => i === 3 || line !== "")
          .join("\n"),
      )
      .join("\n\n---\n\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    link.download = "second-brain-notes.md";
    link.click();
    URL.revokeObjectURL(link.href);
    status(`Exported ${notes.length} note(s) as Markdown.`);
  },
  $("#search-actions"),
);
const statsPanel = el("div", undefined, $("#tools"), "panel");
statsPanel.hidden = true;
button(
  "Show stats",
  async () => {
    statsPanel.hidden = !statsPanel.hidden;
    if (statsPanel.hidden) return;
    const notes = (await allLocal()).filter((n) => !n.deleted);
    const words = notes.reduce(
      (sum, n) => sum + (n.body || "").trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    const counts = {};
    for (const n of notes)
      for (const tag of n.tags || []) counts[tag] = (counts[tag] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    statsPanel.replaceChildren();
    el("h2", "Your second brain", statsPanel);
    el("p", `${notes.length} notes · ${words.toLocaleString()} words`, statsPanel);
    el(
      "p",
      top.length
        ? "Top tags: " + top.map(([t, c]) => `#${t} (${c})`).join(", ")
        : "No tags yet.",
      statsPanel,
      "meta",
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
