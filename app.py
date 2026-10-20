#!/usr/bin/env python3
"""Idempotency bypass tester — fire requests at a live app so each looks unique.

Stdlib-only. Run: python3 app.py [--port 8577]
Opens a UI where you point at your live endpoint; every request gets a fresh
idempotency key / request id and a cache-busting query param so dedupe and
caching layers treat each call as new.
"""

import argparse
import json
import ssl
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request as urlreq
from urllib import error as urlerr
from urllib import parse

IDEMPOTENCY_HEADERS = [
    "idempotency-key",
    "x-idempotency-key",
    "x-request-id",
    "x-correlation-id",
    "request-id",
]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Idempotency Bypass Tester</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; max-width: 960px; margin-inline: auto; }
  h1 { font-size: 1.4rem; }
  label { display: block; font-size: .8rem; font-weight: 600; margin: 12px 0 4px; }
  input, select, textarea { width: 100%; padding: 8px; font: inherit; border: 1px solid #8884; border-radius: 6px; background: transparent; color: inherit; }
  textarea { font-family: ui-monospace, monospace; font-size: .85rem; }
  .row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; }
  button { margin-top: 16px; padding: 10px 20px; font: inherit; font-weight: 600; border: 0; border-radius: 6px; background: #4f7cff; color: #fff; cursor: pointer; }
  button:disabled { opacity: .5; cursor: wait; }
  .hint { font-size: .75rem; opacity: .65; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: .82rem; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #8883; vertical-align: top; }
  code { font-family: ui-monospace, monospace; }
  .ok { color: #3fb950; } .bad { color: #f85149; }
  pre { white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow: auto; margin: 0; font-size: .75rem; }
  #summary { margin-top: 16px; font-weight: 600; }
</style>
</head>
<body>
<h1>Idempotency Bypass Tester</h1>
<p class="hint">Sends requests to your live app. Each attempt gets a fresh
<code>Idempotency-Key</code> / <code>X-Request-Id</code>, a <code>_cb=</code> cache-busting
query param, and <code>{{uuid}}</code> placeholders in headers/body are replaced with a new UUID.
Fixed headers you set that collide with idempotency headers are overwritten per request.</p>

<div class="row">
  <div>
    <label for="url">Target URL</label>
    <input id="url" placeholder="https://your-app.com/api/endpoint">
  </div>
  <div>
    <label for="method">Method</label>
    <select id="method">
      <option>POST</option><option>GET</option><option>PUT</option>
      <option>PATCH</option><option>DELETE</option>
    </select>
  </div>
  <div>
    <label for="count">Requests</label>
    <input id="count" type="number" min="1" max="100" value="3">
  </div>
  <div>
    <label for="delay">Delay (ms)</label>
    <input id="delay" type="number" min="0" max="60000" value="500">
  </div>
</div>

<label for="headers">Extra headers (JSON object)</label>
<textarea id="headers" rows="4" placeholder='{"Authorization": "Bearer ...", "Content-Type": "application/json"}'></textarea>

<label for="body">Body template</label>
<textarea id="body" rows="6" placeholder='{"orderId": "{{uuid}}", "amount": 100}'></textarea>
<div class="hint">Use <code>{{uuid}}</code>, <code>{{ts}}</code> (unix ms), <code>{{n}}</code> (request number).</div>

<button id="send">Send requests</button>
<div id="summary"></div>
<table id="results" hidden>
  <thead><tr><th>#</th><th>Key sent</th><th>Status</th><th>Latency</th><th>Response</th></tr></thead>
  <tbody></tbody>
</table>

<script>
const $ = id => document.getElementById(id);
$("send").onclick = async () => {
  let headers = {};
  try { headers = JSON.parse($("headers").value || "{}"); }
  catch (e) { alert("Headers must be a JSON object"); return; }
  const payload = {
    target_url: $("url").value.trim(),
    method: $("method").value,
    headers,
    body_template: $("body").value,
    count: +$("count").value || 1,
    delay_ms: +$("delay").value || 0,
  };
  if (!payload.target_url) { alert("Enter a target URL"); return; }
  $("send").disabled = true;
  $("results").hidden = true;
  $("summary").textContent = "Sending…";
  try {
    const r = await fetch("/api/send", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    render(data);
  } catch (e) {
    $("summary").textContent = "Request failed: " + e;
  } finally {
    $("send").disabled = false;
  }
};

function render(data) {
  const tb = document.querySelector("#results tbody");
  tb.innerHTML = "";
  let pass = 0;
  data.results.forEach(r => {
    const cls = r.error ? "bad" : (r.status < 400 ? "ok" : "bad");
    if (!r.error && r.status < 400) pass++;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.n}</td>
      <td><code>${r.idempotency_key || ""}</code></td>
      <td class="${cls}">${r.error ? "ERR" : r.status}</td>
      <td>${r.latency_ms ?? ""} ms</td>
      <td><pre>${escapeHtml(r.error || r.response_preview || "")}</pre></td>`;
    tb.appendChild(tr);
  });
  $("results").hidden = false;
  $("summary").textContent = `${pass}/${data.results.length} succeeded`;
}
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
</script>
</body>
</html>
"""


def substitute(template: str, n: int, key: str) -> str:
    return (
        template.replace("{{uuid}}", key)
        .replace("{{ts}}", str(int(time.time() * 1000)))
        .replace("{{n}}", str(n))
    )


def send_one(target_url: str, method: str, headers: dict,
             body_template: str, n: int, timeout: float):
    key = str(uuid.uuid4())
    # Cache-busting query param so caches/proxies treat it as new.
    sep = "&" if parse.urlsplit(target_url).query else "?"
    url = f"{target_url}{sep}_cb={key}"

    out_headers = dict(headers)
    for h in IDEMPOTENCY_HEADERS:
        out_headers[h] = key  # fresh key defeats server-side dedupe

    body = None
    if method not in ("GET", "DELETE") and body_template:
        body = substitute(body_template, n, key).encode()
        if not any(k.lower() == "content-type" for k in out_headers):
            out_headers["Content-Type"] = "application/json"

    req = urlreq.Request(url, data=body, headers=out_headers, method=method)
    ctx = ssl.create_default_context()
    start = time.monotonic()
    try:
        with urlreq.urlopen(req, timeout=timeout, context=ctx) as resp:
            text = resp.read(8192).decode("utf-8", "replace")
            status = resp.status
    except urlerr.HTTPError as e:
        text = e.read(8192).decode("utf-8", "replace")
        status = e.code
    except Exception as e:
        return {"n": n, "idempotency_key": key, "error": str(e)}
    latency = round((time.monotonic() - start) * 1000)
    return {
        "n": n,
        "idempotency_key": key,
        "status": status,
        "latency_ms": latency,
        "response_preview": text[:2000],
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, status=200):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0] == "/":
            data = PAGE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/send":
            return self._json({"error": "not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json({"error": "invalid JSON"}, 400)

        target = payload.get("target_url", "")
        if not target.startswith(("http://", "https://")):
            return self._json({"error": "target_url must be http(s)"}, 400)

        method = payload.get("method", "POST").upper()
        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            return self._json({"error": "bad method"}, 400)

        headers = payload.get("headers") or {}
        if not isinstance(headers, dict):
            return self._json({"error": "headers must be an object"}, 400)

        body_template = payload.get("body_template", "")
        count = max(1, min(int(payload.get("count") or 1), 100))
        delay = max(0, min(int(payload.get("delay_ms") or 0), 60000)) / 1000.0
        timeout = min(float(payload.get("timeout_s") or 30), 120)

        results = []
        for i in range(1, count + 1):
            results.append(
                send_one(target, method, headers, body_template, i, timeout))
            if i < count and delay:
                time.sleep(delay)
        self._json({"results": results})


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8577)
    args = p.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Idempotency Bypass Tester → http://127.0.0.1:{args.port}")
    srv.serve_forever()
