import { api, $, el, status } from "./ui.js";
try {
  const token = new URLSearchParams(location.search).get("token");
  if (token) {
    const result = await api("/api/shared/" + encodeURIComponent(token));
    status(result.collection + " · Read only");
    for (const n of result.notes) {
      const card = el("article", undefined, $("#notes"));
      el("h2", n.title, card);
      el("p", n.body, card);
      el("p", n.tags.join(", "), card, "meta");
      if (n.url) {
        const a = el("a", "Source", card);
        a.href = n.url;
        a.rel = "noopener noreferrer";
      }
    }
  } else {
    status("Public collections");
    for (const s of await api("/api/public")) {
      const a = el("a", s.collection, $("#notes"));
      a.href = "/shared.html?token=" + s.token;
    }
  }
} catch (e) {
  status(e.message);
}
