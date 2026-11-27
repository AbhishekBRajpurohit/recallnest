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
  `<form id="editor"><h2 id="editor-title">Capture a thought</h2><label>Title<input name="title" required maxlength="200"></label><label>Note<textarea name="body" maxlength="50000"></textarea><small id="body-count" class="meta"></small></label><label>Source URL<input name="url" type="url"></label><div id="extra-fields"></div><button>Save note</button><button type="button" id="cancel" class="secondary">New note</button></form>`;
$("#extra-fields").innerHTML =
  `<div class="row"><label>Tags (comma separated)<input name="tags" maxlength="800"></label><label>Folder path<input name="folder" placeholder="College/OS/Unit 2" maxlength="200"></label><label>Collection<input name="collection" placeholder="Placement preparation" maxlength="100"></label></div>`;
const form = $("#editor");
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
  `<div class="panel"><label>Search your knowledge<input id="query" placeholder="Search words…"></label><div class="row"><label>Folder and descendants<input id="folder-filter"></label><label>Tag<input id="tag-filter"></label><label>Collection<input id="collection-filter"></label></div><div class="row"><label>Updated<select id="date-filter"><option value="0">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label><label>Sort by<select id="sort-order"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title (A-Z)</option><option value="longest">Longest first</option></select></label></div><div id="search-actions"></div></div>`;
for (const id of ["query", "folder-filter", "tag-filter", "collection-filter"])
  $("#" + id).oninput = () => render().catch((e) => status(e.message));
$("#date-filter").onchange = () => render().catch((e) => status(e.message));
$("#sort-order").onchange = () => render().catch((e) => status(e.message));
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
async function readMatchingNotes() {
  return filterLocal(
    await allLocal(),
    $("#query").value,
    $("#folder-filter").value,
    $("#tag-filter").value,
    $("#collection-filter").value,
  );
}
const PINNED_KEY = "second-brain-pinned";
function loadPinnedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function savePinnedIds(ids) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]));
  } catch { }
}
async function togglePin(note) {
  const pinned = loadPinnedIds();
  const next = !pinned.has(note.id);
  if (next) pinned.add(note.id);
  else pinned.delete(note.id);
  savePinnedIds(pinned);
  await render();
  status(`${next ? "Pinned" : "Unpinned"} "${note.title}".`);
}
async function readNotes() {
  const days = Number($("#date-filter").value);
  let notes = await readMatchingNotes();
  if (days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    notes = notes.filter((n) => n.updated >= cutoff);
  }
  const pinned = loadPinnedIds();
  const sorters = {
    newest: (a, b) => b.updated - a.updated,
    oldest: (a, b) => a.updated - b.updated,
    title: (a, b) => a.title.localeCompare(b.title),
    longest: (a, b) => (b.body || "").length - (a.body || "").length,
  };
  const sortFn = sorters[$("#sort-order").value] || sorters.newest;
  return [...notes].sort(
    (a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || sortFn(a, b),
  );
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

  const pinned = loadPinnedIds();
  $("#notes").replaceChildren();
  for (const n of notes) {
    const isPinned = pinned.has(n.id);
    const card = el("article", undefined, $("#notes"), isPinned ? "pinned" : "");
    if (isPinned) el("span", "Pinned", card, "badge");
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
      isPinned ? "Unpin" : "Pin",
      () => togglePin(n),
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
      $("#" + id).value = "";
    }
    $("#date-filter").value = "0";
    $("#sort-order").value = "newest";
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
el("small", "Shortcuts: / search · n new note · Ctrl+Enter save", $("#tools"), "meta");
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.key === "/") {
    event.preventDefault();
    $("#query").focus();
  } else if (event.key === "n") {
    event.preventDefault();
    reset();
    form.elements.namedItem("title").focus();
  }
});
const noteBody = form.elements.namedItem("body");
const noteWords = el("small", "", noteBody.parentElement, "meta");
function updateEditorHints() {
  const words = noteBody.value.trim().split(/\s+/).filter(Boolean).length;
  noteWords.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  noteBody.style.height = "auto";
  noteBody.style.height = Math.min(noteBody.scrollHeight, 400) + "px";
}
noteBody.addEventListener("input", updateEditorHints);
form.addEventListener("reset", () => setTimeout(updateEditorHints));
document.addEventListener("click", (event) => {
  if (event.target.closest("article") && event.target.textContent === "Edit")
    setTimeout(updateEditorHints);
});
form.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    form.requestSubmit();
  }
});
updateEditorHints();
const netBadge = el("small", "", undefined, "meta");
$("#status").after(netBadge);
function showNetwork() {
  netBadge.textContent = navigator.onLine
    ? "● Online — changes sync automatically"
    : "○ Offline — notes are saved on this device";
}
window.addEventListener("offline", showNetwork);
window.addEventListener("online", showNetwork);
showNetwork();
let formDirty = false;
form.addEventListener("input", () => (formDirty = true));
form.addEventListener("reset", () => (formDirty = false));
window.addEventListener("beforeunload", (event) => {
  if (formDirty) event.preventDefault();
});
button(
  "Sync now",
  async () => {
    status("Syncing…");
    await syncNow();
  },
  $("#search-actions"),
);
const randomPanel = el("div", undefined, $("#tools"), "panel");
randomPanel.hidden = true;
async function showRandomNote() {
  const notes = (await allLocal()).filter((n) => !n.deleted);
  randomPanel.hidden = false;
  randomPanel.replaceChildren();
  el("h2", "Surprise me", randomPanel);
  if (!notes.length)
    return el("p", "No notes yet. Save your first thought.", randomPanel);
  const n = notes[Math.floor(Math.random() * notes.length)];
  const body = n.body || "";
  el("h3", n.title, randomPanel);
  el("p", body.slice(0, 300) + (body.length > 300 ? "…" : ""), randomPanel);
  button(
    "Show this note",
    async () => {
      $("#query").value = n.title;
      await render();
      $("#notes").scrollIntoView();
    },
    randomPanel,
  );
  button("Another one", showRandomNote, randomPanel);
}
button("Surprise me", showRandomNote, $("#search-actions"));
button(
  "Copy visible notes",
  async () => {
    const notes = await readNotes();
    if (!notes.length) return status("Nothing to copy.");
    const header = `Second Brain · ${notes.length} note(s) · ${new Date().toLocaleDateString()}`;
    const text = notes
      .map((n) => {
        const tags = (n.tags || []).map((t) => "#" + t).join(" ");
        return [n.title, tags, "", n.body]
          .filter((line, i) => i === 2 || line)
          .join("\n");
      })
      .join("\n\n----------\n\n");
    try {
      await navigator.clipboard.writeText(header + "\n\n" + text);
      status(`Copied ${notes.length} note(s) to the clipboard.`);
    } catch {
      status("Clipboard access was blocked by the browser.");
    }
  },
  $("#search-actions"),
);
const activityPanel = el("div", undefined, $("#tools"), "panel");
activityPanel.hidden = true;
button(
  "Show activity",
  async () => {
    activityPanel.hidden = !activityPanel.hidden;
    if (activityPanel.hidden) return;
    const notes = (await allLocal()).filter((n) => !n.deleted);
    activityPanel.replaceChildren();
    el("h2", "Notes updated in the last 7 days", activityPanel);
    for (let i = 0; i < 7; i++) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const start = day.getTime();
      const count = notes.filter(
        (n) => n.updated >= start && n.updated < start + 86400000,
      ).length;
      const label =
        i === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "long" });
      const bar = "█".repeat(Math.min(count, 30));
      el("p", `${label}: ${bar} ${count}`, activityPanel, "meta");
    }
  },
  $("#search-actions"),
);
const FONT_KEY = "second-brain-font";
function applyFontSize(percent) {
  const size = Math.min(150, Math.max(80, percent));
  document.body.style.zoom = size / 100;
  try {
    localStorage.setItem(FONT_KEY, String(size));
  } catch { }
  status(`Text size: ${size}%`);
  return size;
}
let fontPercent = 100;
try {
  fontPercent = Number(localStorage.getItem(FONT_KEY)) || 100;
} catch { }
document.body.style.zoom = fontPercent / 100;
button(
  "A−",
  () => (fontPercent = applyFontSize(fontPercent - 10)),
  $("#search-actions"),
);
button(
  "A+",
  () => (fontPercent = applyFontSize(fontPercent + 10)),
  $("#search-actions"),
);
const dupPanel = el("div", undefined, $("#tools"), "panel");
dupPanel.hidden = true;
button(
  "Find duplicates",
  async () => {
    dupPanel.hidden = !dupPanel.hidden;
    if (dupPanel.hidden) return;
    const groups = new Map();
    for (const n of await allLocal()) {
      if (n.deleted) continue;
      const key = n.title.trim().toLowerCase();
      groups.set(key, [...(groups.get(key) || []), n]);
    }
    const dups = [...groups.values()].filter((g) => g.length > 1);
    dupPanel.replaceChildren();
    el("h2", "Duplicate titles", dupPanel);
    if (!dups.length) el("p", "No duplicate titles found.", dupPanel);
    for (const group of dups) {
      el("p", `${group[0].title} × ${group.length}`, dupPanel, "meta");
      button(
        "Show",
        async () => {
          $("#query").value = group[0].title;
          await render();
        },
        dupPanel,
      );
    }
  },
  $("#search-actions"),
);
const untaggedPanel = el("div", undefined, $("#tools"), "panel");
untaggedPanel.hidden = true;
button(
  "Untagged notes",
  async () => {
    untaggedPanel.hidden = !untaggedPanel.hidden;
    if (untaggedPanel.hidden) return;
    const notes = (await allLocal()).filter(
      (n) => !n.deleted && !(n.tags || []).length,
    );
    untaggedPanel.replaceChildren();
    el("h2", `Notes without tags (${notes.length})`, untaggedPanel);
    if (!notes.length) el("p", "Every note has a tag. Nice and tidy.", untaggedPanel);
    for (const n of notes.slice(0, 10)) {
      el("p", n.title, untaggedPanel, "meta");
      button(
        "Find",
        async () => {
          $("#query").value = n.title;
          await render();
        },
        untaggedPanel,
      );
    }
    if (notes.length > 10)
      el("p", `…and ${notes.length - 10} more.`, untaggedPanel, "meta");
  },
  $("#search-actions"),
);
const longestPanel = el("div", undefined, $("#tools"), "panel");
longestPanel.hidden = true;
button(
  "Longest notes",
  async () => {
    longestPanel.hidden = !longestPanel.hidden;
    if (longestPanel.hidden) return;
    const words = (text) => (text || "").trim().split(/\s+/).filter(Boolean).length;
    const top = (await allLocal())
      .filter((n) => !n.deleted)
      .map((n) => ({ note: n, count: words(n.body) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    longestPanel.replaceChildren();
    el("h2", "Your 5 longest notes", longestPanel);
    if (!top.length) el("p", "No notes yet.", longestPanel);
    for (const { note, count } of top) {
      el("p", `${note.title} — ${count} words`, longestPanel, "meta");
      button(
        "Show",
        async () => {
          $("#query").value = note.title;
          await render();
        },
        longestPanel,
      );
    }
  },
  $("#search-actions"),
);
const linksPanel = el("div", undefined, $("#tools"), "panel");
linksPanel.hidden = true;
button(
  "Saved links",
  async () => {
    linksPanel.hidden = !linksPanel.hidden;
    if (linksPanel.hidden) return;
    const linked = (await allLocal()).filter(
      (n) => !n.deleted && /^https?:\/\//i.test(n.url || ""),
    );
    linksPanel.replaceChildren();
    el("h2", `Notes with a source link (${linked.length})`, linksPanel);
    if (!linked.length) el("p", "No notes have a source URL yet.", linksPanel);
    for (const n of linked.slice(0, 15)) {
      const row = el("p", undefined, linksPanel, "meta");
      const link = el("a", n.title, row);
      link.href = n.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    if (linked.length > 15)
      el("p", `…and ${linked.length - 15} more.`, linksPanel, "meta");
  },
  $("#search-actions"),
);
const reviewPanel = el("div", undefined, $("#tools"), "panel");
reviewPanel.hidden = true;
button(
  "Review queue",
  async () => {
    reviewPanel.hidden = !reviewPanel.hidden;
    if (reviewPanel.hidden) return;
    const oldest = (await allLocal())
      .filter((n) => !n.deleted)
      .sort((a, b) => a.updated - b.updated)
      .slice(0, 5);
    reviewPanel.replaceChildren();
    el("h2", "Notes you have not touched in a while", reviewPanel);
    if (!oldest.length) el("p", "Nothing to review yet.", reviewPanel);
    for (const n of oldest) {
      const days = Math.floor((Date.now() - n.updated) / 86400000);
      el("p", `${n.title} — updated ${days} day(s) ago`, reviewPanel, "meta");
      button(
        "Open",
        async () => {
          $("#query").value = n.title;
          await render();
          $("#notes").scrollIntoView();
        },
        reviewPanel,
      );
    }
  },
  $("#search-actions"),
);
function addGroupBrowser({ buttonLabel, heading, emptyLabel, getGroup, inputSelector }) {
  const panel = el("div", undefined, $("#tools"), "panel");
  panel.hidden = true;
  button(
    buttonLabel,
    async () => {
      panel.hidden = !panel.hidden;
      if (panel.hidden) return;
      const counts = new Map();
      for (const n of await allLocal()) {
        if (n.deleted) continue;
        const group = getGroup(n) || emptyLabel;
        counts.set(group, (counts.get(group) || 0) + 1);
      }
      panel.replaceChildren();
      el("h2", heading, panel);
      if (!counts.size) return el("p", "No notes yet.", panel);
      const chips = el("div", undefined, panel, "chips");
      for (const [group, count] of [...counts].sort()) {
        const chip = button(
          `${group} (${count})`,
          async () => {
            $(inputSelector).value = group === emptyLabel ? "" : group;
            await render();
          },
          chips,
        );
        chip.className = "chip secondary";
      }
    },
    $("#search-actions"),
  );
}
addGroupBrowser({
  buttonLabel: "Browse folders",
  heading: "Browse by folder",
  emptyLabel: "(no folder)",
  getGroup: (n) => n.folder,
  inputSelector: "#folder-filter",
});
addGroupBrowser({
  buttonLabel: "Browse collections",
  heading: "Browse by collection",
  emptyLabel: "(no collection)",
  getGroup: (n) => n.collection,
  inputSelector: "#collection-filter",
});
const topButton = button(
  "↑ Top",
  () => window.scrollTo({ top: 0, behavior: "smooth" }),
  document.body,
);
topButton.title = "Back to top";
topButton.setAttribute("aria-label", "Back to top");
Object.assign(topButton.style, {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  display: "none",
  zIndex: "10",
  boxShadow: "0 2px 8px rgba(0,0,0,.25)",
});
window.addEventListener(
  "scroll",
  () => {
    topButton.style.display = window.scrollY > 400 ? "block" : "none";
  },
  { passive: true },
);
const dayPanel = el("div", undefined, $("#tools"), "panel");
dayPanel.hidden = true;
button(
  "Note of the day",
  async () => {
    dayPanel.hidden = !dayPanel.hidden;
    if (dayPanel.hidden) return;
    const notes = (await allLocal())
      .filter((n) => !n.deleted)
      .sort((a, b) => a.created - b.created);
    dayPanel.replaceChildren();
    el("h2", "Note of the day", dayPanel);
    if (!notes.length) return el("p", "Save a note to see one here.", dayPanel);
    const today = new Date();
    const seed = today.getFullYear() * 372 + today.getMonth() * 31 + today.getDate();
    const n = notes[seed % notes.length];
    el("h3", n.title, dayPanel);
    el("p", (n.body || "").slice(0, 300), dayPanel);
    button(
      "Open",
      async () => {
        $("#query").value = n.title;
        await render();
        $("#notes").scrollIntoView();
      },
      dayPanel,
    );
  },
  $("#search-actions"),
);
const STOP_WORDS = new Set("that with this from have your were been than then also just will what when which would could should their there them they into about because".split(" "));
const wordsPanel = el("div", undefined, $("#tools"), "panel");
wordsPanel.hidden = true;
button(
  "Top words",
  async () => {
    wordsPanel.hidden = !wordsPanel.hidden;
    if (wordsPanel.hidden) return;
    const counts = new Map();
    for (const n of await allLocal())
      for (const word of `${n.title} ${n.body || ""}`.toLowerCase().match(/[a-z]{4,}/g) || [])
        if (!n.deleted && !STOP_WORDS.has(word))
          counts.set(word, (counts.get(word) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10);
    wordsPanel.replaceChildren();
    el("h2", top.length ? "Most used words" : "Not enough text yet", wordsPanel);
    const chips = el("div", undefined, wordsPanel, "chips");
    for (const [word, count] of top) {
      const chip = button(
        `${word} (${count})`,
        async () => {
          $("#query").value = word;
          await render();
        },
        chips,
      );
      chip.className = "chip secondary";
    }
  },
  $("#search-actions"),
);
const HISTORY_KEY = "second-brain-searches";
const historyBox = el("div", undefined, undefined, "chips");
$("#query").parentElement.after(historyBox);
function loadHistory() {
  return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
}
function showHistory() {
  historyBox.replaceChildren();
  for (const term of loadHistory()) {
    const chip = button(
      term,
      async () => {
        $("#query").value = term;
        await render();
      },
      historyBox,
    );
    chip.className = "chip secondary";
  }
}
$("#query").addEventListener("keydown", (event) => {
  const term = event.target.value.trim();
  if (event.key !== "Enter" || !term) return;
  const history = [term, ...loadHistory().filter((t) => t !== term)].slice(0, 5);
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { }
  showHistory();
});
showHistory();
el(
  "style",
  `@page { margin: 14mm; }
@media print {
  h2 { font-size: 18px; margin: 0 0 6px; }
  #tools, #workspace, #status, button, .chips { display: none !important; }
  :root, body { background: #fff !important; color: #000 !important; }
  article { background: #fff !important; color: #000 !important; break-inside: avoid; border: 1px solid #999; }
}`,
  document.head,
);
button(
  "Print notes",
  async () => {
    const notes = await readNotes();
    if (!notes.length) return status("Nothing to print.");
    status(`Printing ${notes.length} note(s)…`);
    window.print();
  },
  $("#search-actions"),
);
button(
  "Paste as note",
  async () => {
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      return status("Clipboard access was blocked by the browser.");
    }
    if (!text) return status("The clipboard is empty.");
    const [first, ...rest] = text.split("\n");
    reset();
    const body = form.elements.namedItem("body");
    form.elements.namedItem("title").value = first.trim().slice(0, 120);
    body.value = (rest.join("\n") || first).trim();
    body.dispatchEvent(new Event("input", { bubbles: true }));
    form.scrollIntoView();
    status("Pasted from the clipboard. Review it and press Save note.");
  },
  $("#search-actions"),
);
function insertAtCursor(text) {
  const field = form.elements.namedItem("body");
  field.setRangeText(text, field.selectionStart, field.selectionEnd, "end");
  field.focus();
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const editorTools = el("div", undefined, undefined, "chips");
form.elements.namedItem("body").parentElement.after(editorTools);
const snippets = [
  ["+ Date", () => new Date().toLocaleDateString() + " "],
  [
    "+ Time",
    () =>
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " ",
  ],
  ["+ Bullet", () => "\n- "],
  ["+ Checklist", () => "\n- [ ] "],
];
for (const [label, make] of snippets) {
  const chip = button(label, () => insertAtCursor(make()), editorTools);
  chip.className = "chip secondary";
}
const VIEWS_KEY = "second-brain-views";
const filterIds = ["query", "folder-filter", "tag-filter", "collection-filter", "date-filter", "sort-order"].filter((id) => $("#" + id));
const viewsBox = el("div", undefined, undefined, "chips");
$("#search-actions").after(viewsBox);
function loadViews() {
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]"); } catch { return []; }
}
function showViews() {
  viewsBox.replaceChildren();
  for (const view of loadViews()) {
    const chip = button(`★ ${view.name}`, async () => {
      for (const id of filterIds) {
        const fallback = id === "date-filter" ? "0" : id === "sort-order" ? "newest" : "";
        $("#" + id).value = view.values[id] ?? fallback;
      }
      await render();
    }, viewsBox);
    chip.className = "chip secondary";
  }
}
button("Save this search", () => {
  const values = Object.fromEntries(filterIds.map((id) => [id, $("#" + id).value]));
  const name = prompt("Name this search:", values.query || "My search");
  if (!name) return;
  const views = [...loadViews().filter((v) => v.name !== name), { name, values }];
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views.slice(-8))); } catch { }
  showViews();
  status(`Saved search "${name}".`);
}, $("#search-actions"));
showViews();
el(
  "style",
  `#notes.compact article { padding-top: 8px; padding-bottom: 8px; }
#notes.compact article h2 { font-size: 16px; margin: 0 0 4px; }
#notes.compact article > p:not(.meta) { display: none; }`,
  document.head,
);
const COMPACT_KEY = "second-brain-compact";
function setCompact(on, announce) {
  $("#notes").classList.toggle("compact", on);
  compactButton.textContent = on ? "Full view" : "Compact view";
  if (announce) status(on ? "Compact view: titles only." : "Full view.");
  try {
    localStorage.setItem(COMPACT_KEY, on ? "1" : "0");
  } catch { }
}
const compactButton = button(
  "Compact view",
  () => setCompact(!$("#notes").classList.contains("compact"), true),
  $("#search-actions"),
);
try {
  setCompact(localStorage.getItem(COMPACT_KEY) === "1", false);
} catch { }
el(
  "small",
  "Tip: double-click a note to edit it · press Esc in the editor to clear it",
  $("#tools"),
  "meta",
);
$("#notes").addEventListener("dblclick", (event) => {
  const card = event.target.closest("article");
  if (!card || event.target.closest("button, a")) return;
  const edit = [...card.querySelectorAll("button")].find(
    (b) => b.textContent === "Edit",
  );
  if (edit) edit.click();
});
form.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const typed =
    form.elements.namedItem("title").value || form.elements.namedItem("body").value;
  if (typed && !confirm("Discard what you typed?")) return;
  reset();
  status("Editor cleared.");
});
const GOAL_KEY = "second-brain-goal";
const goalPanel = el("div", undefined, $("#tools"), "panel");
goalPanel.hidden = true;
button(
  "Daily word goal",
  async () => {
    goalPanel.hidden = !goalPanel.hidden;
    if (goalPanel.hidden) return;
    let goal = 200;
    try { goal = Number(localStorage.getItem(GOAL_KEY)) || 200; } catch { }
    const start = new Date().setHours(0, 0, 0, 0);
    const words = (await allLocal())
      .filter((n) => !n.deleted && n.updated >= start)
      .reduce((sum, n) => sum + (n.body || "").trim().split(/\s+/).filter(Boolean).length, 0);
    const filled = Math.round((Math.min(words, goal) / goal) * 20);
    goalPanel.replaceChildren();
    el("h2", "Words in notes updated today", goalPanel);
    el("p", `${"█".repeat(filled)}${"░".repeat(20 - filled)} ${words} / ${goal}`, goalPanel);
    el("p", words >= goal ? "Goal reached. Great work!" : `${goal - words} more words to go.`, goalPanel, "meta");
    button("Change goal", () => {
      const value = Math.round(Number(prompt("Words per day:", String(goal))));
      if (!value || value < 1) return;
      try { localStorage.setItem(GOAL_KEY, String(value)); } catch { }
      goalPanel.hidden = true;
      status(`Daily goal set to ${value} words.`);
    }, goalPanel);
  },
  $("#search-actions"),
);
button(
  "Find & replace",
  () => {
    const body = form.elements.namedItem("body");
    if (!body.value) return status("Write something in the editor first.");
    const find = prompt("Find (not case sensitive):");
    if (!find) return;
    const replacement = prompt(`Replace "${find}" with:`, "");
    if (replacement === null) return;
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "gi");
    const count = (body.value.match(pattern) || []).length;
    if (!count) return status(`"${find}" was not found in the editor.`);
    body.value = body.value.replace(pattern, () => replacement);
    body.dispatchEvent(new Event("input", { bubbles: true }));
    body.focus();
    body.setSelectionRange(0, 0);
    status(`Replaced ${count} occurrence(s) in the editor.`);
  },
  $("#search-actions"),
);
let focusedCard = -1;
function focusCard(step) {
  const cards = [...$("#notes").querySelectorAll("article")];
  if (!cards.length) return;
  focusedCard = Math.min(cards.length - 1, Math.max(0, focusedCard + step));
  for (const card of cards) card.style.outline = "";
  cards[focusedCard].style.outline = "2px solid #38846b";
  cards[focusedCard].scrollIntoView({ block: "center", behavior: "smooth" });
}
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.key === "j") focusCard(1);
  else if (event.key === "k") focusCard(-1);
  else if (event.key === "e") {
    const card = $("#notes").querySelectorAll("article")[focusedCard];
    const edit =
      card && [...card.querySelectorAll("button")].find((b) => b.textContent === "Edit");
    if (edit) edit.click();
  }
});
const IDLE_MS = 5 * 60 * 1000;
el(
  "style",
  `#notes.idle article { filter: blur(10px); user-select: none; }
#notes.idle::before { content: "Hidden after 5 minutes idle. Move the mouse or press a key to show."; display: block; padding: 12px; }`,
  document.head,
);
let autoHide = true;
let idleTimer;
function wake() {
  $("#notes").classList.remove("idle");
  clearTimeout(idleTimer);
  if (autoHide) idleTimer = setTimeout(() => $("#notes").classList.add("idle"), IDLE_MS);
}
for (const type of ["mousemove", "keydown", "click", "touchstart", "scroll"])
  window.addEventListener(type, wake, { passive: true });
const idleButton = button(
  "Auto-hide: on",
  () => {
    autoHide = !autoHide;
    idleButton.textContent = `Auto-hide: ${autoHide ? "on" : "off"}`;
    status(autoHide ? "Notes hide after 5 idle minutes." : "Auto-hide is off.");
    wake();
  },
  $("#search-actions"),
);
wake();
const templates = {
  Meeting: "Date: \nAttendees: \n\nAgenda:\n- \n\nNotes:\n\nAction items:\n- [ ] ",
  Journal: "Today I feel: \n\nThree good things:\n1. \n2. \n3. \n\nTomorrow I will: ",
  "To-do": "Today:\n- [ ] \n- [ ] \n- [ ] \n\nLater:\n- [ ] ",
  "Book notes": "Author: \nKey ideas:\n- \n\nFavourite quote:\n\nWhat I will apply: ",
};
const templateBox = el("div", undefined, undefined, "chips");
form.elements.namedItem("body").parentElement.after(templateBox);
for (const [name, text] of Object.entries(templates)) {
  const chip = button(`Template: ${name}`, () => {
    const body = form.elements.namedItem("body");
    const title = form.elements.namedItem("title");
    if (body.value.trim() && !confirm("Replace what is in the editor?")) return;
    if (!title.value.trim()) title.value = `${name} ${new Date().toLocaleDateString()}`;
    body.value = text;
    body.dispatchEvent(new Event("input", { bubbles: true }));
    body.focus();
  }, templateBox);
  chip.className = "chip secondary";
}
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
