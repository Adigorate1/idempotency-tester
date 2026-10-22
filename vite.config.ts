import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';

const execAsync = promisify(exec);

const IDEMPOTENCY_HEADERS = [
  'Idempotency-Key',
  'X-Idempotency-Key',
  'X-Request-Id',
  'X-Correlation-Id',
  'Request-Id',
];

function substitute(template: string, n: number, key: string): string {
  return template
    .replaceAll('{{uuid}}', key)
    .replaceAll('{{ts}}', String(Date.now()))
    .replaceAll('{{n}}', String(n));
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'api-backend-proxy',
      configureServer(server) {
        // Echo endpoint for quick testing
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || '', 'http://localhost:3000');

          if (url.pathname === '/api/echo' && req.method === 'POST') {
            try {
              const body = await parseJsonBody(req);
              const headersObj: Record<string, string> = {};
              for (const [k, v] of Object.entries(req.headers)) {
                if (typeof v === 'string') headersObj[k] = v;
              }
              return sendJson(res, 200, {
                status: 'ok',
                received_at: new Date().toISOString(),
                idempotency_key:
                  req.headers['idempotency-key'] ||
                  req.headers['x-idempotency-key'] ||
                  req.headers['x-request-id'] ||
                  url.searchParams.get('_cb') ||
                  'none',
                headers: headersObj,
                query: Object.fromEntries(url.searchParams.entries()),
                body,
              });
            } catch (e: any) {
              return sendJson(res, 400, { error: e.message });
            }
          }

          if (url.pathname === '/api/emulator/status' && req.method === 'GET') {
            try {
              const { stdout } = await execAsync('adb devices');
              const lines = stdout.split('\n').slice(1);
              const devices = lines
                .map(l => l.trim())
                .filter(l => l.endsWith('device'))
                .map(l => l.split('\t')[0]);
              return sendJson(res, 200, { adb: true, devices });
            } catch {
              return sendJson(res, 200, { adb: false, devices: [] });
            }
          }

          if (url.pathname === '/api/emulator/connect' && req.method === 'POST') {
            try {
              const body = await parseJsonBody(req);
              const devicePort = Number(body.device_port);
              if (!devicePort || devicePort < 1 || devicePort > 65535) {
                return sendJson(res, 400, { error: 'device_port must be 1-65535' });
              }
              const localPort = Number(body.local_port) || Math.floor(Math.random() * 10000 + 40000);
              const serial = body.serial ? `-s ${body.serial} ` : '';
              await execAsync(`adb ${serial}forward tcp:${localPort} tcp:${devicePort}`);
              return sendJson(res, 200, {
                ok: true,
                serial: body.serial || 'default',
                local_port: localPort,
                local_url: `http://127.0.0.1:${localPort}`,
              });
            } catch (err: any) {
              return sendJson(res, 500, { error: err.message || 'adb forward failed' });
            }
          }

          if (url.pathname === '/api/send' && req.method === 'POST') {
            try {
              const payload = await parseJsonBody(req);
              const targetUrl = String(payload.target_url || '').trim();
              if (!/^https?:\/\//i.test(targetUrl)) {
                return sendJson(res, 400, { error: 'target_url must be http(s)' });
              }

              const method = String(payload.method || 'POST').toUpperCase();
              const headers = (payload.headers && typeof payload.headers === 'object') ? payload.headers : {};
              const bodyTemplate = String(payload.body_template || '');
              const count = Math.max(1, Math.min(Number(payload.count) || 1, 100));
              const delayMs = Math.max(0, Math.min(Number(payload.delay_ms) || 0, 60000));
              const timeoutMs = Math.min(Number(payload.timeout_s || 30) * 1000, 120000);
              const breakOnFail = Boolean(payload.break_on_fail);

              const results = [];
              for (let i = 1; i <= count; i++) {
                const key = randomUUID();
                const sentAt = new Date().toISOString();
                const separator = targetUrl.includes('?') ? '&' : '?';
                const finalUrl = `${targetUrl}${separator}_cb=${encodeURIComponent(key)}`;

                const requestHeaders: Record<string, string> = {};
                for (const [k, v] of Object.entries(headers)) {
                  requestHeaders[k] = substitute(String(v), i, key);
                }
                for (const h of IDEMPOTENCY_HEADERS) {
                  requestHeaders[h] = key;
                }

                let bodySent = '';
                let fetchBody: string | undefined = undefined;
                if (method !== 'GET' && method !== 'HEAD' && bodyTemplate) {
                  bodySent = substitute(bodyTemplate, i, key);
                  fetchBody = bodySent;
                  if (!Object.keys(requestHeaders).some(k => k.toLowerCase() === 'content-type')) {
                    requestHeaders['Content-Type'] = 'application/json';
                  }
                }

                const startTime = performance.now();
                let status: number | string = 'ERR';
                let latencyMs = 0;
                let responsePreview = '';
                let errorStr: string | null = null;

                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), timeoutMs);

                  const fetchRes = await fetch(finalUrl, {
                    method,
                    headers: requestHeaders,
                    body: fetchBody,
                    signal: controller.signal,
                  });
                  clearTimeout(timer);

                  latencyMs = Math.round(performance.now() - startTime);
                  status = fetchRes.status;
                  const text = await fetchRes.text();
                  responsePreview = text.slice(0, 4000);
                } catch (e: any) {
                  latencyMs = Math.round(performance.now() - startTime);
                  errorStr = e?.name === 'AbortError' ? 'Request timed out' : String(e?.message || e);
                }

                const item = {
                  n: i,
                  sent_at: sentAt,
                  idempotency_key: key,
                  body_sent: bodySent,
                  status,
                  latency_ms: latencyMs,
                  response_preview: responsePreview,
                  error: errorStr,
                };
                results.push(item);

                const isFailed = Boolean(errorStr) || (typeof status === 'number' && status >= 400);
                if (breakOnFail && isFailed) {
                  break;
                }

                if (i < count && delayMs > 0) {
                  await new Promise(r => setTimeout(r, delayMs));
                }
              }

              return sendJson(res, 200, { results });
            } catch (err: any) {
              return sendJson(res, 500, { error: err.message || 'Server error' });
            }
          }

          next();
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
