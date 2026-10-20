(function () {
  if (window.__txnRobotInjected) return;
  window.__txnRobotInjected = true;
  window.__txnCap = window.__txnCap || [];

  const now = () => new Date().toISOString();
  const emit = (e) => {
    window.__txnCap.push(e);
    try {
      window.postMessage({ src: "txn-robot", entry: e }, "*");
    } catch (err) {}
    console.log("[txn-robot]", e.method, e.url, "@", e.time, "->", e.status);
  };

  const _f = window.fetch;
  window.fetch = async function (input, init) {
    const t = now();
    const u = typeof input === "string" ? input : (input && input.url) || "";
    const m = (init && init.method) || (input && input.method) || "GET";
    const b = init && init.body != null ? String(init.body) : "";
    const r = await _f.apply(this, arguments);
    try {
      const x = await r.clone().text();
      emit({ time: t, url: u, method: m, status: r.status, request_body: b, response_body: x.slice(0, 20000) });
    } catch (err) {
      emit({ time: t, url: u, method: m, status: r.status, request_body: b, response_body: "" });
    }
    return r;
  };

  const _o = XMLHttpRequest.prototype.open;
  const _s = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__m = m;
    this.__u = u;
    return _o.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (b) {
    const t = now();
    const x = this;
    this.addEventListener("loadend", () => {
      emit({
        time: t,
        url: x.__u || "",
        method: x.__m || "GET",
        status: x.status,
        request_body: b != null ? String(b) : "",
        response_body: (x.responseText || "").slice(0, 20000),
      });
    });
    return _s.apply(this, arguments);
  };
})();
