import { $, api, el, button, status } from "./ui.js";
const area = el("details", undefined, $("#workspace"));
el("summary", "Weekly digest email", area);
const box = el("div", undefined, area, "panel");
el(
  "p",
  "Opt in to send a digest to your account email once every seven days. Note summaries and shared-tag connections are sent through the configured email provider. The first send is seven days after enabling; the server must be running.",
  box,
);
const output = el("pre", "", box);
button(
  "Preview and status",
  async () => {
    const d = await api("/api/digest");
    output.textContent = `${d.digest_enabled ? "Enabled" : "Disabled"} · Provider ${d.configured ? "configured" : "not configured"}\n${d.digest_enabled ? "Next due: " + new Date(d.digest_next).toLocaleString() : ""}\n${d.delivery?.error || ""}\n\n${d.text}`;
  },
  box,
);
button(
  "Enable weekly email",
  async () => {
    await api("/api/digest", "PUT", { enabled: true });
    status("Weekly digest enabled. Requires email provider configuration.");
  },
  box,
);
button(
  "Disable weekly email",
  async () => {
    await api("/api/digest", "PUT", { enabled: false });
    status("Weekly digest disabled.");
  },
  box,
);
