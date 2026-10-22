import { HttpMethod, ParsedCurl, RequestResult, RunMetrics } from '../types';

export const IDEMPOTENCY_HEADERS = [
  'Idempotency-Key',
  'X-Idempotency-Key',
  'X-Request-Id',
  'X-Correlation-Id',
  'Request-Id',
];

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function substituteTemplate(template: string, n: number, key: string): string {
  if (!template) return '';
  return template
    .replaceAll('{{uuid}}', key)
    .replaceAll('{{ts}}', String(Date.now()))
    .replaceAll('{{n}}', String(n))
    .replaceAll('{{iso}}', new Date().toISOString());
}

export function formatTime(isoOrDate: string | Date): string {
  if (!isoOrDate) return '';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return String(isoOrDate);
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function calculateMetrics(results: RequestResult[]): RunMetrics {
  const sent = results.length;
  let succeeded = 0;
  let failed = 0;
  const latencies: number[] = [];

  for (const r of results) {
    const isBad = Boolean(r.error) || (typeof r.status === 'number' && r.status >= 400) || r.status === 'ERR';
    if (isBad) {
      failed++;
    } else {
      succeeded++;
      if (r.latency_ms !== null && r.latency_ms !== undefined) {
        latencies.push(r.latency_ms);
      }
    }
  }

  let medianLatency: number | null = null;
  let minLatency: number | null = null;
  let maxLatency: number | null = null;

  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    minLatency = sorted[0];
    maxLatency = sorted[sorted.length - 1];
    const mid = Math.floor(sorted.length / 2);
    medianLatency = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  return {
    sent,
    succeeded,
    failed,
    medianLatency,
    minLatency,
    maxLatency,
  };
}

export function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

export function buildCurlCommand(
  url: string,
  method: HttpMethod,
  headersObj: Record<string, string>,
  bodyTemplate: string,
  n: number = 1,
  key?: string
): string {
  const finalKey = key || generateUUID();
  const sep = url.includes('?') ? '&' : '?';
  const targetUrl = `${url}${sep}_cb=${encodeURIComponent(finalKey)}`;

  const parts = [`curl -i -X ${method}`];
  const headers: Record<string, string> = {};

  Object.entries(headersObj).forEach(([k, v]) => {
    headers[k] = substituteTemplate(String(v), n, finalKey);
  });

  IDEMPOTENCY_HEADERS.forEach((h) => {
    headers[h] = finalKey;
  });

  if (method !== 'GET' && method !== 'HEAD' && bodyTemplate && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  Object.entries(headers).forEach(([k, v]) => {
    parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  });

  if (method !== 'GET' && method !== 'HEAD' && bodyTemplate) {
    const sentBody = substituteTemplate(bodyTemplate, n, finalKey);
    parts.push(`--data ${shellQuote(sentBody)}`);
  }

  parts.push(shellQuote(targetUrl));
  return parts.join(' \\\n  ');
}

export function parseCurlCommand(rawText: string): ParsedCurl {
  const normalized = rawText.replace(/\\\r?\n/g, ' ').trim();
  const tokens = (normalized.match(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|\S+/g) || []).map((t) => {
    if (t.length > 1 && (t[0] === "'" || t[0] === '"')) {
      return t.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    return t;
  });

  const out: ParsedCurl = {
    url: '',
    method: 'GET',
    headers: {},
    body: '',
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'curl' || t === '-i' || t === '-s' || t === '-v' || t === '-L' || t === '--compressed') {
      continue;
    }
    if (t === '-X' || t === '--request') {
      const next = tokens[++i];
      if (next) out.method = next.toUpperCase() as HttpMethod;
      continue;
    }
    if (t === '-H' || t === '--header') {
      const h = tokens[++i] || '';
      const c = h.indexOf(':');
      if (c > 0) {
        const key = h.slice(0, c).trim();
        const val = h.slice(c + 1).trim();
        out.headers[key] = val;
      }
      continue;
    }
    if (
      t === '-d' ||
      t === '--data' ||
      t === '--data-raw' ||
      t === '--data-binary' ||
      t === '--data-ascii' ||
      t === '--json'
    ) {
      out.body = tokens[++i] || '';
      if (!out.method || out.method === 'GET') {
        out.method = 'POST';
      }
      continue;
    }
    if (/^https?:\/\//i.test(t)) {
      out.url = t;
    }
  }

  return out;
}

export async function executeSingleDirectRequest(
  url: string,
  method: HttpMethod,
  headers: Record<string, string>,
  bodyTemplate: string,
  n: number,
  timeoutMs: number = 30000
): Promise<RequestResult> {
  const key = generateUUID();
  const sentAt = new Date().toISOString();
  const sep = url.includes('?') ? '&' : '?';
  const finalUrl = `${url}${sep}_cb=${encodeURIComponent(key)}`;

  const requestHeaders: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => {
    requestHeaders[k] = substituteTemplate(String(v), n, key);
  });
  IDEMPOTENCY_HEADERS.forEach((h) => {
    requestHeaders[h] = key;
  });

  let bodySent = '';
  let requestBody: string | undefined = undefined;

  if (method !== 'GET' && method !== 'HEAD' && bodyTemplate) {
    bodySent = substituteTemplate(bodyTemplate, n, key);
    requestBody = bodySent;
    if (!Object.keys(requestHeaders).some((k) => k.toLowerCase() === 'content-type')) {
      requestHeaders['Content-Type'] = 'application/json';
    }
  }

  const start = performance.now();
  let status: number | string = 'ERR';
  let latencyMs = 0;
  let responsePreview = '';
  let errorStr: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(finalUrl, {
      method,
      headers: requestHeaders,
      body: requestBody,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);

    latencyMs = Math.round(performance.now() - start);
    status = res.status;
    const text = await res.text();
    responsePreview = text.slice(0, 4000);
  } catch (err: any) {
    latencyMs = Math.round(performance.now() - start);
    status = 'ERR';
    errorStr = err?.name === 'AbortError'
      ? 'Request timed out'
      : `${err?.message || err} — likely CORS or network block; switch Execution Mode to "Server-Side Proxy" to bypass browser CORS constraints.`;
  }

  return {
    n,
    sent_at: sentAt,
    idempotency_key: key,
    body_sent: bodySent,
    status,
    latency_ms: latencyMs,
    response_preview: responsePreview,
    error: errorStr,
    headers_sent: requestHeaders,
    url_sent: finalUrl,
  };
}
