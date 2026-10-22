import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Copy, Check, Info, Sparkles, AlertCircle } from 'lucide-react';
import { Header } from './components/Header';
import { MetricsBar } from './components/MetricsBar';
import { ResultsTable } from './components/ResultsTable';
import { DetailModal } from './components/DetailModal';
import { CurlStudio } from './components/CurlStudio';
import { EmulatorPanel } from './components/EmulatorPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { HttpMethod, ExecutionMode, RequestResult, ParsedCurl } from './types';
import {
  generateUUID,
  substituteTemplate,
  calculateMetrics,
  buildCurlCommand,
  executeSingleDirectRequest,
} from './utils/idempotency';

interface HistoryItem {
  id: string;
  timestamp: string;
  targetUrl: string;
  method: string;
  results: RequestResult[];
}

export const App: React.FC = () => {
  // Theme management matching Devin artifact kit
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('idemp_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('idemp_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'tester' | 'curl' | 'emulator' | 'history'>('tester');

  // Form Configuration
  const [targetUrl, setTargetUrl] = useState<string>('/api/echo');
  const [method, setMethod] = useState<HttpMethod>('POST');
  const [count, setCount] = useState<number>(3);
  const [delayMs, setDelayMs] = useState<number>(500);
  const [headersJson, setHeadersJson] = useState<string>(
    '{\n  "Content-Type": "application/json"\n}'
  );
  const [bodyTemplate, setBodyTemplate] = useState<string>(
    '{\n  "orderId": "{{uuid}}",\n  "amount": 100,\n  "attempt": {{n}},\n  "timestamp": {{ts}}\n}'
  );
  const [breakOnFail, setBreakOnFail] = useState<boolean>(false);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('proxy');

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<RequestResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<RequestResult | null>(null);
  const [copiedCurl, setCopiedCurl] = useState<boolean>(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('idemp_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('idemp_history', JSON.stringify(history));
    } catch {}
  }, [history]);

  // Abort controller ref for stopping runs
  const stopRequestedRef = useRef<boolean>(false);

  // Validate headers JSON on change
  useEffect(() => {
    if (!headersJson.trim()) {
      setJsonError(null);
      return;
    }
    try {
      const parsed = JSON.parse(headersJson);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Headers must be a JSON object (key-value pairs)');
      } else {
        setJsonError(null);
      }
    } catch {
      setJsonError('Invalid JSON syntax in headers');
    }
  }, [headersJson]);

  // Handle Tag Insertion in Body Template
  const insertPlaceholder = (tag: string) => {
    setBodyTemplate((prev) => prev + (prev.endsWith('\n') ? '' : ' ') + tag);
  };

  // Send Requests
  const handleSendRequests = async () => {
    const trimmedUrl = targetUrl.trim();
    if (!trimmedUrl) {
      alert('Please enter a target URL.');
      return;
    }

    let parsedHeaders: Record<string, string> = {};
    if (headersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(headersJson);
      } catch {
        alert('Headers must be a valid JSON object.');
        return;
      }
    }

    const totalCount = Math.max(1, Math.min(count, 100));
    const delay = Math.max(0, Math.min(delayMs, 60000));

    stopRequestedRef.current = false;
    setIsRunning(true);
    setResults([]);

    // Proxy mode via /api/send or direct
    if (executionMode === 'proxy') {
      try {
        // Resolve full target URL if relative
        const fullUrl = trimmedUrl.startsWith('/')
          ? `${window.location.origin}${trimmedUrl}`
          : trimmedUrl;

        const response = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_url: fullUrl,
            method,
            headers: parsedHeaders,
            body_template: bodyTemplate,
            count: totalCount,
            delay_ms: delay,
            break_on_fail: breakOnFail,
          }),
        });

        const data = await response.json();
        if (data.results && Array.isArray(data.results)) {
          setResults(data.results);
          saveHistory(fullUrl, method, data.results);
        } else {
          throw new Error(data.error || 'Unknown server response');
        }
      } catch (err: any) {
        // Fallback to direct client-side execution if proxy endpoint had an issue
        const fallbackResults = await runDirectClientExecution(
          trimmedUrl,
          method,
          parsedHeaders,
          bodyTemplate,
          totalCount,
          delay,
          breakOnFail
        );
        setResults(fallbackResults);
        saveHistory(trimmedUrl, method, fallbackResults);
      }
    } else {
      // Direct browser execution
      const directResults = await runDirectClientExecution(
        trimmedUrl,
        method,
        parsedHeaders,
        bodyTemplate,
        totalCount,
        delay,
        breakOnFail
      );
      setResults(directResults);
      saveHistory(trimmedUrl, method, directResults);
    }

    setIsRunning(false);
  };

  const runDirectClientExecution = async (
    url: string,
    reqMethod: HttpMethod,
    reqHeaders: Record<string, string>,
    bodyTpl: string,
    reqCount: number,
    delay: number,
    shouldBreakOnFail: boolean
  ): Promise<RequestResult[]> => {
    const list: RequestResult[] = [];
    for (let i = 1; i <= reqCount; i++) {
      if (stopRequestedRef.current) break;

      const res = await executeSingleDirectRequest(
        url,
        reqMethod,
        reqHeaders,
        bodyTpl,
        i,
        30000
      );
      list.push(res);
      setResults([...list]);

      const isBad = Boolean(res.error) || (typeof res.status === 'number' && res.status >= 400);
      if (shouldBreakOnFail && isBad) {
        break;
      }

      if (i < reqCount && delay > 0 && !stopRequestedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return list;
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    setIsRunning(false);
  };

  const saveHistory = (url: string, httpMethod: string, runResults: RequestResult[]) => {
    if (runResults.length === 0) return;
    const item: HistoryItem = {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      targetUrl: url,
      method: httpMethod,
      results: runResults,
    };
    setHistory((prev) => [item, ...prev.slice(0, 29)]);
  };

  const handleCopyCurl = () => {
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(headersJson || '{}');
    } catch {}

    const curl = buildCurlCommand(targetUrl, method, parsed, bodyTemplate, 1);
    navigator.clipboard.writeText(curl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1500);
  };

  const handleImportCurl = (parsed: ParsedCurl) => {
    setTargetUrl(parsed.url);
    if (parsed.method) setMethod(parsed.method);
    if (Object.keys(parsed.headers).length > 0) {
      setHeadersJson(JSON.stringify(parsed.headers, null, 2));
    }
    if (parsed.body) {
      setBodyTemplate(parsed.body);
    }
    setActiveTab('tester');
  };

  const handleRestoreRun = (item: HistoryItem) => {
    setTargetUrl(item.targetUrl);
    setMethod(item.method as HttpMethod);
    setResults(item.results);
    setActiveTab('tester');
  };

  const metrics = calculateMetrics(results);

  // Live preview calculations for body interpolation
  const sampleKey = '4fa83981-d7ec-44f2-959c-70335e69bf88';
  const previewBody = substituteTemplate(bodyTemplate, 1, sampleKey);

  return (
    <main className="a-shell">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        historyCount={history.length}
      />

      {activeTab === 'curl' && (
        <CurlStudio
          url={targetUrl}
          method={method}
          headersJson={headersJson}
          bodyTemplate={bodyTemplate}
          onImportCurl={handleImportCurl}
        />
      )}

      {activeTab === 'emulator' && (
        <EmulatorPanel
          onFillTargetUrl={(newUrl) => {
            setTargetUrl(newUrl);
            setActiveTab('tester');
          }}
        />
      )}

      {activeTab === 'history' && (
        <HistoryPanel
          history={history}
          onClearHistory={() => setHistory([])}
          onRestoreRun={handleRestoreRun}
          onSelectResult={setSelectedResult}
        />
      )}

      {activeTab === 'tester' && (
        <div className="space-y-6">
          <section className="a-panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border-secondary))] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[rgb(var(--text-primary))]">
                  Request Configuration
                </h2>
                <p className="text-xs text-[rgb(var(--text-secondary))] mt-0.5">
                  Headers and body template will be dynamically randomized per request attempt.
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[rgb(var(--text-secondary))]">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setTargetUrl('/api/echo');
                    setMethod('POST');
                    setExecutionMode('proxy');
                  }}
                  className="px-2 py-0.5 rounded border border-[rgb(var(--border-secondary))] bg-[rgb(var(--bg-wash))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]"
                >
                  Built-in Echo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetUrl('https://httpbin.org/post');
                    setMethod('POST');
                    setExecutionMode('proxy');
                  }}
                  className="px-2 py-0.5 rounded border border-[rgb(var(--border-secondary))] bg-[rgb(var(--bg-wash))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]"
                >
                  httpbin.org
                </button>
              </div>
            </div>

            {/* Target URL, Method, Count, Delay */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold mb-1 text-[rgb(var(--text-primary))]">
                  Target URL
                </label>
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://your-app.com/api/orders or /api/echo"
                  className="w-full p-2 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-mono text-[rgb(var(--text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--bg-accent))]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1 text-[rgb(var(--text-primary))]">
                  Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as HttpMethod)}
                  className="w-full p-2 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-semibold text-[rgb(var(--text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--bg-accent))]"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                  <option value="HEAD">HEAD</option>
                  <option value="OPTIONS">OPTIONS</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1 text-[rgb(var(--text-primary))]">
                  Requests
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="w-full p-2 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-mono text-[rgb(var(--text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--bg-accent))]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1 text-[rgb(var(--text-primary))]">
                  Delay (ms)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60000}
                  step={50}
                  value={delayMs}
                  onChange={(e) => setDelayMs(Math.max(0, Math.min(60000, Number(e.target.value) || 0)))}
                  className="w-full p-2 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-mono text-[rgb(var(--text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--bg-accent))]"
                />
              </div>
            </div>

            {/* Extra headers */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[rgb(var(--text-primary))]">
                  Extra Headers (JSON Object)
                </label>
                {jsonError && (
                  <span className="text-[11px] text-[rgb(var(--text-red))] flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {jsonError}
                  </span>
                )}
              </div>
              <textarea
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                rows={3}
                placeholder='{"Authorization": "Bearer token123", "Content-Type": "application/json"}'
                className="w-full p-2 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-mono text-[rgb(var(--text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--bg-accent))]"
              />
              <p className="text-[11px] text-[rgb(var(--text-secondary))] mt-0.5">
                Note: <code>Idempotency-Key</code>, <code>X-Idempotency-Key</code>, <code>X-Request-Id</code>, <code>X-Correlation-Id</code>, and <code>Request-Id</code> will be added or overwritten with fresh UUIDs automatically.
              </p>
            </div>

            {/* Body template */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-xs font-semibold text-[rgb(var(--text-primary))]">
                  Body Template
                </label>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[rgb(var(--text-secondary))]">Insert token:</span>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder('"{{uuid}}"')}
                    className="px-1.5 py-0.5 rounded bg-[rgb(var(--tint-secondary))] font-mono text-[rgb(var(--text-accent))] hover:bg-[rgb(var(--tint-primary))]"
                    title="Inserts fresh UUID"
                  >
                    &#123;&#123;uuid&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder('{{ts}}')}
                    className="px-1.5 py-0.5 rounded bg-[rgb(var(--tint-secondary))] font-mono text-[rgb(var(--text-accent))] hover:bg-[rgb(var(--tint-primary))]"
                    title="Inserts timestamp in ms"
                  >
                    &#123;&#123;ts&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder('{{n}}')}
                    className="px-1.5 py-0.5 rounded bg-[rgb(var(--tint-secondary))] font-mono text-[rgb(var(--text-accent))] hover:bg-[rgb(var(--tint-primary))]"
                    title="Inserts request count index"
                  >
                    &#123;&#123;n&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder('"{{iso}}"')}
                    className="px-1.5 py-0.5 rounded bg-[rgb(var(--tint-secondary))] font-mono text-[rgb(var(--text-accent))] hover:bg-[rgb(var(--tint-primary))]"
                    title="Inserts ISO 8601 date string"
                  >
                    &#123;&#123;iso&#125;&#125;
                  </button>
                </div>
              </div>
              <textarea
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
                rows={4}
                placeholder='{"orderId": "{{uuid}}", "amount": 100, "clientTime": {{ts}}}'
                className="w-full p-2 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-mono text-[rgb(var(--text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--bg-accent))]"
              />
            </div>

            {/* Live Body Preview Accordion */}
            {bodyTemplate && (
              <details className="text-xs border border-[rgb(var(--border-secondary))] rounded-md bg-[rgb(var(--bg-wash))] p-2.5">
                <summary className="font-semibold text-[rgb(var(--text-secondary))] cursor-pointer select-none flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[rgb(var(--text-accent))]" />
                  Live Preview of Substituted Body (Request #1)
                </summary>
                <pre className="mt-2 p-2 rounded bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-secondary))] font-mono text-[11px] whitespace-pre-wrap max-h-32 overflow-auto text-[rgb(var(--text-primary))]">
                  {previewBody}
                </pre>
              </details>
            )}

            {/* Execution options & triggers */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[rgb(var(--border-secondary))]">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[rgb(var(--text-secondary))]">Mode:</span>
                  <select
                    value={executionMode}
                    onChange={(e) => setExecutionMode(e.target.value as ExecutionMode)}
                    className="p-1 rounded border border-[rgb(var(--border-secondary))] bg-[rgb(var(--bg-wash))] font-medium text-[rgb(var(--text-primary))]"
                  >
                    <option value="proxy">Server-Side Proxy (No CORS limit)</option>
                    <option value="direct">Direct Browser Fetch</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={breakOnFail}
                    onChange={(e) => setBreakOnFail(e.target.checked)}
                    className="rounded text-[rgb(var(--bg-accent))]"
                  />
                  <span className="text-[rgb(var(--text-secondary))]">
                    Breaking point (stop on first failure status ≥ 400 or network error)
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCurl}
                  className="a-btn a-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5"
                  title="Copy current request as cURL command"
                >
                  {copiedCurl ? <Check className="w-3.5 h-3.5 text-[rgb(var(--text-green))]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCurl ? 'Copied' : 'Copy as cURL'}
                </button>

                {isRunning ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="a-btn a-btn-ghost text-xs py-1.5 px-3 text-[rgb(var(--text-red))] border-[rgb(var(--text-red)/0.4)] flex items-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendRequests}
                    className="a-btn a-btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Send {count} {count === 1 ? 'request' : 'requests'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Results section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[rgb(var(--text-primary))]">
                Execution Results
              </h2>
              {results.length > 0 && (
                <span className="text-xs text-[rgb(var(--text-secondary))] font-mono">
                  {results.length} total recorded
                </span>
              )}
            </div>

            <MetricsBar
              metrics={metrics}
              results={results}
              isRunning={isRunning}
              totalPlanned={count}
              onSelectResult={setSelectedResult}
            />

            <ResultsTable
              results={results}
              onSelectResult={setSelectedResult}
              onClearResults={() => setResults([])}
            />
          </section>

          {/* Educational Callout */}
          <div className="a-callout a-callout--risk flex items-start gap-3">
            <Info className="w-4 h-4 text-[rgb(var(--text-orange))] shrink-0 mt-0.5" />
            <div className="text-xs text-[rgb(var(--text-secondary))] space-y-1">
              <div className="font-semibold text-[rgb(var(--text-primary))]">
                Testing Tips &amp; Deduplication Strategies
              </div>
              <p>
                <strong>Header-based deduplication:</strong> Most payment APIs (e.g. Stripe, Adyen, Braintree) deduplicate requests via <code>Idempotency-Key</code> or <code>X-Request-Id</code>. Every request here generates a fresh cryptographically random UUID.
              </p>
              <p>
                <strong>Body fingerprinting:</strong> If your API dedupes based on a hash of the payload rather than a header, make sure to insert <code>&#123;&#123;uuid&#125;&#125;</code> or <code>&#123;&#123;ts&#125;&#125;</code> inside the body template.
              </p>
              <p>
                <strong>CORS:</strong> In <em>Server-Side Proxy</em> mode, requests are forwarded through the local proxy backend so CORS headers are never enforced. In <em>Direct Browser Fetch</em> mode, your browser sends requests directly, requiring proper <code>Access-Control-Allow-Origin</code> headers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full inspection modal */}
      <DetailModal
        result={selectedResult}
        onClose={() => setSelectedResult(null)}
      />

      <footer className="mt-12 pt-4 border-t border-[rgb(var(--border-secondary))] text-center text-xs text-[rgb(var(--text-tertiary))]">
        Idempotency Bypass Tester — Point only at apps, APIs, and endpoints you own or are authorized to test.
      </footer>
    </main>
  );
};

export default App;
