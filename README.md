# Idempotency Bypass Tester (React)

A modern React application for testing, verifying, and bypassing idempotency and deduplication layers on live HTTP APIs and microservices.

Every request in a test batch is assigned fresh unique identifiers:

- **5 Idempotency Headers**: Fresh UUID generated per call in `Idempotency-Key`, `X-Idempotency-Key`, `X-Request-Id`, `X-Correlation-Id`, and `Request-Id`. Any fixed colliding header is overwritten dynamically.
- **Cache-Busting Query**: Automatic `_cb=<uuid>` query parameter appended to every request to defeat HTTP caches and proxy deduplication.
- **Dynamic Placeholders**: `{{uuid}}` (fresh UUID), `{{ts}}` (Unix millisecond timestamp), `{{n}}` (request sequence index 1..N), and `{{iso}}` (ISO 8601 string) substituted in headers and body. Essential when backends deduplicate based on body fingerprints.
- **Execution Modes**:
  - **Server-Side Proxy**: Bypasses browser CORS restrictions, allowing you to test any API endpoint.
  - **Direct Browser Fetch**: Fires requests directly from your browser.
  - **Built-in Echo Server**: Fast in-memory endpoint (`/api/echo`) for testing idempotency behavior immediately.
- **Breaking Point**: Stop the batch run on the first failed request (error or status ≥ 400).
- **cURL Studio**: One-click **Copy as cURL** with all headers and parameters escaped, plus **Import cURL** to paste and parse commands from Chrome DevTools, Postman, or terminal into the form.
- **Android Emulator Bridge**: One-click port forwarding (`adb forward`) to test apps running in Android Studio AVD, BlueStacks, Nox, LDPlayer, MEmu, or Genymotion without certificate issues.
- **Detailed Audit & History**: Inspect full request headers, URL, resolved body, latency, and response status for every attempt. Export results to JSON or CSV.

## Development

```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev

# Build production bundle
npm run build
```
