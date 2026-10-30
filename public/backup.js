import { $, api, el, button, status } from "./ui.js";
import { allLocal, localSave } from "./local.js";
const area = el("details", undefined, $("#workspace"));
el("summary", "Profile and backup", area);
const box = el("div", undefined, area, "panel");
box.innerHTML =
  '<label>Display name<input id="profile-name" maxlength="80"></label><label>Import JSON backup<input id="import" type="file" accept="application/json,.json"></label>';
button(
  "Save profile",
  async () => {
    const user = await api("/api/me", "PUT", {
      name: $("#profile-name").value,
    });
    window.currentUser = user;
    localStorage.setItem("brain-user", JSON.stringify(user));
    status("Profile updated.");
  },
  box,
);
button(
  "Export local notes",
  async () => {
    const notes = (await allLocal())
      .filter((n) => !n.deleted)
      .map(({ title, body, url, tags, folder, collection }) => ({
        title,
        body,
        url,
        tags,
        folder,
        collection,
      }));
    const blob = new Blob(
      [JSON.stringify({ format: "second-brain", version: 1, notes }, null, 2)],
      { type: "application/json" },
    );
    const a = el("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "second-brain-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status(
      "Exported " + notes.length + " notes, including pending local edits.",
    );
  },
  box,
);
$("#import").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10_000_000) throw Error("Maximum backup size is 10 MB");
    const data = JSON.parse(await file.text());
    if (
      data.format !== "second-brain" ||
      data.version !== 1 ||
      !Array.isArray(data.notes) ||
      data.notes.length > 500
    )
      throw Error("Expected version 1 backup, maximum 500 notes");
    // Validate the entire batch before the first write. Never trust IDs or owners from a backup.
    for (const n of data.notes) {
      if (
        !n ||
        typeof n.title !== "string" ||
        !n.title.trim() ||
        n.title.length > 200 ||
        typeof n.body !== "string" ||
        n.body.length > 50000 ||
        typeof n.url !== "string" ||
        n.url.length > 2000 ||
        (n.url && !/^https?:\/\//.test(n.url)) ||
        !Array.isArray(n.tags) ||
        n.tags.length > 20 ||
        n.tags.some((t) => typeof t !== "string" || t.length > 40) ||
        typeof n.folder !== "string" ||
        n.folder.length > 200 ||
        typeof n.collection !== "string" ||
        n.collection.length > 100
      )
        throw Error("Backup contains an invalid note");
    }
    if (!confirm(`Import ${data.notes.length} notes as new copies?`)) return;
    for (const { title, body, url, tags, folder, collection } of data.notes)
      await localSave({ title, body, url, tags, folder, collection }, null);
    window.dispatchEvent(new Event("brain-imported"));
    status("Imported locally. Click Sync now to upload.");
  } catch (e) {
    status(e.message);
  } finally {
    e.target.value = "";
  }
};
window.addEventListener(
  "brain-ready",
  () => ($("#profile-name").value = window.currentUser.name),
);
