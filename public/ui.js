export const $ = (s) => document.querySelector(s);
export const status = (message) => ($("#status").textContent = message);
export async function api(path, method = "GET", data) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Request failed");
  return value;
}
export function el(tag, text, parent, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  if (parent) parent.append(e);
  return e;
}
export function button(text, fn, parent) {
  const b = el("button", text, parent);
  b.type = "button";
  b.onclick = () =>
    Promise.resolve()
      .then(fn)
      .catch((e) => status(e.message));
  return b;
}
