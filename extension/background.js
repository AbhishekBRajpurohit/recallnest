chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!/^https?:\/\//.test(tab.url || ""))
      throw Error("Open a normal webpage first");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title.slice(0, 200),
        url: location.href,
        body: (getSelection().toString() || document.body.innerText).slice(
          0,
          12000,
        ),
      }),
    });
    const { appUrl = "http://localhost:3000" } =
      await chrome.storage.local.get("appUrl");
    const target = new URL(appUrl);
    if (!["http:", "https:"].includes(target.protocol))
      throw Error("Set a valid app URL in extension options");
    target.pathname = "/";
    target.hash = "capture=" + encodeURIComponent(JSON.stringify(result));
    await chrome.tabs.create({ url: target.href });
  } catch (e) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({
      title: e.message + " — check extension options",
    });
  }
});
