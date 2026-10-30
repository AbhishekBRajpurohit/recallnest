chrome.storage.local
  .get("appUrl")
  .then(
    (x) =>
      (document.querySelector("#url").value =
        x.appUrl || "http://localhost:3000"),
  );
document.querySelector("#save").onclick = async () => {
  try {
    const u = new URL(document.querySelector("#url").value);
    if (!["http:", "https:"].includes(u.protocol))
      throw Error("Use HTTP or HTTPS");
    await chrome.storage.local.set({ appUrl: u.origin });
    document.querySelector("#status").textContent = "Saved";
  } catch (e) {
    document.querySelector("#status").textContent = e.message;
  }
};
