# Idempotency Bypass Tester

A test tool for hammering your own live app when its idempotency/dedupe layer
swallows your repeat test requests. Every request is made to look brand-new:

- Fresh UUID in `Idempotency-Key`, `X-Idempotency-Key`, `X-Request-Id`,
  `X-Correlation-Id` and `Request-Id` headers (any fixed header you set that
  collides is overwritten per request)
- A `_cb=<uuid>` cache-busting query param on every call
- `{{uuid}}`, `{{ts}}` (unix ms) and `{{n}}` (request number) placeholders in
  your headers/body are substituted per request — use these if the app dedupes
  on body content rather than a key header
- Fire N requests with a configurable delay; per-call status, latency and
  response are shown in a results table

## Two ways to run it

### `idempotency-tester.html` — zero install

Open the file in any browser. Requests fire from your browser, so the target
must allow cross-origin requests (`Access-Control-Allow-Origin`). Works great
when your live app already permits CORS.

### `app.py` — Python proxy (no CORS limits)

```bash
python3 app.py          # stdlib only, no installs
# open http://127.0.0.1:8577
```

The UI is served locally and requests are forwarded server-side, so CORS does
not apply. Use this when your app blocks cross-origin browser calls.

#### Testing an app in an Android emulator

No certificate, proxy config, or manual port forwarding needed. With
`adb` (Android platform-tools) on your PATH and an emulator running:

1. In the **Emulator** section of `app.py`'s UI, enter the port your app
   listens on inside the emulator (e.g. `8080`).
2. Click **Connect & fill Target URL** — the tool runs `adb forward`
   to a free localhost port and fills the Target URL automatically.
3. Send requests as normal; they reach the emulator over plain HTTP.

Works over HTTP only — a deliberate choice so no CA cert or app
`network_security_config` changes are required.

## Extra features

- **Breaking point**: checkbox stops the run on the first failed request
  (network error or status ≥ 400).
- **Body sent column**: shows the exact resolved JSON body each POST sent.
- **cURL import/export**: paste a `curl` command to auto-fill the form, or
  click **Copy as cURL** to export the configured request with a fresh key.

## Notes

- Point it only at apps you own or are authorized to test.
- If your app dedupes on a fingerprint of the body, put `{{uuid}}` in the body
  template so each request body differs.
