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

## Notes

- Point it only at apps you own or are authorized to test.
- If your app dedupes on a fingerprint of the body, put `{{uuid}}` in the body
  template so each request body differs.
