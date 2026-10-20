(function () {
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.src !== "txn-robot") return;
    const entry = e.data.entry;
    if (!entry) return;
    chrome.storage.local.get("captures", (res) => {
      const list = res.captures || [];
      list.push(entry);
      while (list.length > 500) list.shift();
      chrome.storage.local.set({ captures: list });
    });
  });
})();
