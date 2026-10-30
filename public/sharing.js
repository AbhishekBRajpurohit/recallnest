import { $, api, el, button, status } from "./ui.js";
const area = el("details", undefined, $("#workspace"));
el("summary", "Share a collection", area);
const form = el("div", undefined, area, "panel");
form.innerHTML =
  '<label>Collection name<input id="share-name"></label><label><input type="checkbox" id="share-public"> List publicly</label><p>Anyone with the link can read all synced notes currently in this collection. Only you can edit. Moving a note into this collection shares it too.</p><div id="share-list"></div>';
async function refresh() {
  const target = $("#share-list");
  target.replaceChildren();
  for (const s of await api("/api/shares")) {
    const row = el("p", undefined, target);
    const a = el(
      "a",
      s.collection + (s.public ? " (public)" : " (unlisted)"),
      row,
    );
    a.href = "/shared.html?token=" + s.token;
    a.target = "_blank";
    el("small", " " + location.origin + a.getAttribute("href"), row);
    button(
      "Revoke",
      async () => {
        await api("/api/shares/" + s.token, "DELETE", {});
        await refresh();
      },
      row,
    );
  }
}
button(
  "Create read-only link",
  async () => {
    await api("/api/shares", "POST", {
      collection: $("#share-name").value,
      public: $("#share-public").checked,
    });
    await refresh();
    status("Sharing enabled. Copy the link below.");
  },
  form,
);
button("Refresh links", refresh, form);
const browse = el("a", "Browse public collections", form);
browse.href = "/shared.html";
