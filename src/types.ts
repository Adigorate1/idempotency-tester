export type HttpMethod = 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type ExecutionMode = 'proxy' | 'direct' | 'echo';

export interface RequestConfig {
  targetUrl: string;
  method: HttpMethod;
  count: number;
  delayMs: number;
  headersJson: string;
  bodyTemplate: string;
  breakOnFail: boolean;
  executionMode: ExecutionMode;
}

export interface RequestResult {
  n: number;
  sent_at: string;
  idempotency_key: string;
  body_sent: string;
  status: number | string;
  latency_ms: number | null;
  response_preview: string;
  error?: string | null;
  headers_sent?: Record<string, string>;
  url_sent?: string;
}

export interface RunMetrics {
  sent: number;
  succeeded: number;
  failed: number;
  medianLatency: number | null;
  minLatency: number | null;
  maxLatency: number | null;
}

export interface EmulatorDeviceStatus {
  adb: boolean;
  devices: string[];
  message?: string;
}

export interface ParsedCurl {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string;
}
