#!/usr/bin/env python3
"""Idempotency bypass tester — fire requests at a live app so each looks unique.

Stdlib-only. Run: python3 app.py [--port 8577]
Opens a UI where you point at your live endpoint; every request gets a fresh
idempotency key / request id and a cache-busting query param so dedupe and
caching layers treat each call as new.
"""

import argparse
import json
import shutil
import socket
import ssl
import subprocess
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
  button.ghost { background: transparent; color: inherit; border: 1px solid #8886; }
  button:disabled { opacity: .5; cursor: wait; }
  .hint { font-size: .75rem; opacity: .65; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: .82rem; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #8883; vertical-align: top; }
  code { font-family: ui-monospace, monospace; }
  .ok { color: #3fb950; } .bad { color: #f85149; }
  .emu { border: 1px solid #8884; border-radius: 8px; padding: 12px 14px; margin-top: 14px; font-size: .85rem; }
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

<div class="emu">
  <strong>Emulator</strong> — no certificate or proxy setup needed. The app must listen
  on a plain-HTTP port inside the emulator; this forwards it to localhost via adb.
  <span id="emu-status" class="hint"></span>
  <div class="row" style="margin-top:8px">
    <div>
      <label for="emu-port">App port inside emulator</label>
      <input id="emu-port" type="number" min="1" max="65535" placeholder="e.g. 8080">
    </div>
    <div style="grid-column: span 2; display:flex; align-items:end; gap:10px">
      <button id="emu-connect" class="ghost" type="button" style="margin:0">Connect &amp; fill Target URL</button>
      <span id="emu-result" class="hint"></span>
    </div>
  </div>
</div>

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
<button id="curl-btn" class="ghost">Copy as cURL</button>
<label class="hint" style="display:flex;gap:8px;align-items:center;margin-top:10px">
  <input id="break" type="checkbox" style="width:auto">
  Breaking point: stop the run on the first failed request (error or status ≥ 400)
</label>
<details style="margin-top:10px">
  <summary class="hint" style="cursor:pointer">Import / export a bash cURL command</summary>
  <textarea id="curlbox" rows="4" placeholder="Paste a curl command and click Import, or use Copy as cURL to export the configured request"></textarea>
  <button id="curl-import" class="ghost" style="margin-top:8px">Import curl</button>
</details>
<div id="summary"></div>
<table id="results" hidden>
  <thead><tr><th>#</th><th>Key sent</th><th>Body sent</th><th>Status</th><th>Latency</th><th>Response</th></tr></thead>
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
    break_on_fail: $("break").checked,
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
      <td><pre>${escapeHtml(r.body_sent || "")}</pre></td>
      <td class="${cls}">${r.error ? "ERR" : r.status}</td>
      <td>${r.latency_ms ?? ""} ms</td>
      <td><pre>${escapeHtml(r.error || r.response_preview || "")}</pre></td>`;
    tb.appendChild(tr);
  });
  $("results").hidden = false;
  $("summary").textContent = `${pass}/${data.results.length} succeeded`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
const IDEMP_HEADERS = ["Idempotency-Key","X-Idempotency-Key","X-Request-Id","X-Correlation-Id","Request-Id"];
function subst(tpl, n, key) {
  return tpl.split("{{uuid}}").join(key).split("{{ts}}").join(String(Date.now())).split("{{n}}").join(String(n));
}
$("curl-btn").onclick = () => {
  const url = $("url").value.trim();
  if (!/^https?:\/\//i.test(url)) { alert("Enter a valid http(s) target URL"); return; }
  let extra = {};
  try { extra = JSON.parse($("headers").value || "{}"); } catch (e) { alert("Headers must be JSON"); return; }
  const key = crypto.randomUUID();
  const method = $("method").value;
  const u = url + (url.includes("?") ? "&" : "?") + "_cb=" + encodeURIComponent(key);
  const hs = {};
  Object.keys(extra).forEach(k => hs[k] = subst(String(extra[k]), 1, key));
  IDEMP_HEADERS.forEach(h => hs[h] = key);
  let cmd = `curl -i -X ${method} `;
  cmd += Object.keys(hs).map(k => `-H ${shellQuote(k + ": " + hs[k])}`).join(" \\\n  ");
  if (method !== "GET" && method !== "DELETE" && $("body").value)
    cmd += ` \\\n  --data ${shellQuote(subst($("body").value, 1, key))}`;
  cmd += ` \\\n  ${shellQuote(u)}`;
  $("curlbox").value = cmd;
  if (navigator.clipboard) navigator.clipboard.writeText(cmd);
};
$("curl-import").onclick = () => {
  const tokens = ($("curlbox").value.replace(/\\\n/g, " ").match(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|\S+/g) || [])
    .map(t => t.length > 1 && (t[0] === "'" || t[0] === '"') ? t.slice(1, -1).replace(/\\(.)/g, "$1") : t);
  let u = "", m = "", hs = {}, b = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (["curl","-i","-s","-v","-L"].includes(t)) continue;
    if (t === "-X" || t === "--request") { m = (tokens[++i] || "").toUpperCase(); continue; }
    if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "", c = h.indexOf(":");
      if (c > 0) hs[h.slice(0, c).trim()] = h.slice(c + 1).trim();
      continue;
    }
    if (["-d","--data","--data-raw","--data-binary","--json","--data-ascii"].includes(t)) { b = tokens[++i] || ""; continue; }
    if (/^https?:\/\//i.test(t)) u = t;
  }
  if (!u) { alert("No URL found in that command"); return; }
  $("url").value = u;
  $("method").value = m || (b ? "POST" : "GET");
  $("headers").value = Object.keys(hs).length ? JSON.stringify(hs, null, 2) : "";
  if (b) $("body").value = b;
};

(async () => {
  try {
    const r = await fetch("/api/emulator/status");
    const s = await r.json();
    $("emu-status").textContent = s.adb
      ? (s.devices.length
          ? "adb found — device(s): " + s.devices.join(", ")
          : "adb found — no emulator/device connected")
      : "adb not found on PATH — install Android platform-tools to use emulator mode";
  } catch (e) {}
})();

$("emu-connect").onclick = async () => {
  const port = +$("emu-port").value;
  if (!port) { alert("Enter the port your app listens on inside the emulator"); return; }
  $("emu-result").textContent = "connecting…";
  try {
    const r = await fetch("/api/emulator/connect", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({device_port: port}),
    });
    const d = await r.json();
    if (d.ok) {
      $("url").value = d.local_url;
      $("emu-result").textContent =
        `forwarded ${d.serial}:${port} → ${d.local_url} — Target URL filled`;
    } else {
      $("emu-result").textContent = "failed: " + (d.error || "unknown");
    }
  } catch (e) {
    $("emu-result").textContent = "failed: " + e;
  }
};
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
    body_sent = ""
    if method not in ("GET", "DELETE") and body_template:
        body_sent = substitute(body_template, n, key)
        body = body_sent.encode()
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
        return {"n": n, "idempotency_key": key, "body_sent": body_sent, "error": str(e)}
    latency = round((time.monotonic() - start) * 1000)
    return {
        "n": n,
        "idempotency_key": key,
        "body_sent": body_sent,
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
        path = self.path.split("?")[0]
        if path == "/api/emulator/status":
            have_adb, serials = adb_devices()
            return self._json({"adb": have_adb, "devices": serials})
        if path == "/":
            data = PAGE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self.path.split("?")[0] == "/api/emulator/connect":
            return self._emulator_connect()
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

        break_on_fail = bool(payload.get("break_on_fail"))
        results = []
        for i in range(1, count + 1):
            r = send_one(target, method, headers, body_template, i, timeout)
            results.append(r)
            if break_on_fail and ("error" in r or (r.get("status") or 0) >= 400):
                break
            if i < count and delay:
                time.sleep(delay)
        self._json({"results": results})

    def _emulator_connect(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json({"error": "invalid JSON"}, 400)

        device_port = int(payload.get("device_port") or 0)
        if not 1 <= device_port <= 65535:
            return self._json({"error": "device_port must be 1-65535"}, 400)

        have_adb, serials = adb_devices()
        if not have_adb:
            return self._json({"error": "adb not found — install Android platform-tools"}, 400)
        if not serials:
            return self._json({"error": "no emulator/device connected (adb devices is empty)"}, 400)

        serial = payload.get("serial") or serials[0]
        if serial not in serials:
            return self._json({"error": f"device {serial} not connected"}, 400)

        local_port = int(payload.get("local_port") or 0) or free_port()
        try:
            proc = subprocess.run(
                ["adb", "-s", serial, "forward",
                 f"tcp:{local_port}", f"tcp:{device_port}"],
                capture_output=True, text=True, timeout=10,
            )
        except Exception as e:
            return self._json({"error": str(e)}, 500)
        if proc.returncode != 0:
            return self._json({"error": proc.stderr.strip() or "adb forward failed"}, 500)
        return self._json({
            "ok": True,
            "serial": serial,
            "local_port": local_port,
            "local_url": f"http://127.0.0.1:{local_port}",
        })


def adb_devices():
    """Return (adb_available, [device serials])."""
    if not shutil.which("adb"):
        return False, []
    try:
        out = subprocess.run(
            ["adb", "devices"], capture_output=True, text=True, timeout=10
        ).stdout
    except Exception:
        return True, []
    serials = [
        line.split("\t")[0]
        for line in out.splitlines()[1:]
        if line.strip() and line.strip().endswith("device")
    ]
    return True, serials


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8577)
    args = p.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Idempotency Bypass Tester → http://127.0.0.1:{args.port}")
    srv.serve_forever()
