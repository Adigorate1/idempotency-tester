import React, { useState } from 'react';
import { Copy, Check, ArrowDownToLine, ArrowUpRight, Terminal, Info } from 'lucide-react';
import { HttpMethod, ParsedCurl } from '../types';
import { buildCurlCommand, parseCurlCommand, IDEMPOTENCY_HEADERS } from '../utils/idempotency';

interface CurlStudioProps {
  url: string;
  method: HttpMethod;
  headersJson: string;
  bodyTemplate: string;
  onImportCurl: (parsed: ParsedCurl) => void;
}

export const CurlStudio: React.FC<CurlStudioProps> = ({
  url,
  method,
  headersJson,
  bodyTemplate,
  onImportCurl,
}) => {
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  let extraHeaders: Record<string, string> = {};
  try {
    extraHeaders = JSON.parse(headersJson || '{}');
  } catch {
    extraHeaders = {};
  }

  const generatedCurl = buildCurlCommand(
    url || 'https://api.your-app.com/v1/orders',
    method,
    extraHeaders,
    bodyTemplate,
    1
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCurl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportStatus('Please paste a curl command first.');
      return;
    }

    try {
      const parsed = parseCurlCommand(importText);
      if (!parsed.url) {
        setImportStatus('No valid URL found in that cURL command.');
        return;
      }
      onImportCurl(parsed);
      setImportStatus(`Successfully imported ${parsed.method} ${parsed.url}`);
      setTimeout(() => setImportStatus(null), 3500);
    } catch (err: any) {
      setImportStatus(`Import failed: ${err.message || err}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="a-panel">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[rgb(var(--text-accent))]" />
            <h2 className="text-sm font-semibold text-[rgb(var(--text-primary))]">
              Generated Bash cURL Command
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="a-btn a-btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied to Clipboard' : 'Copy cURL'}
          </button>
        </div>

        <p className="text-xs text-[rgb(var(--text-secondary))] mb-3">
          Exports the current configuration with freshly generated UUIDs in all 5 standard idempotency headers and a <code>_cb</code> cache-busting query parameter.
        </p>

        <pre className="p-3.5 rounded-lg bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] font-mono text-xs whitespace-pre-wrap break-all text-[rgb(var(--text-primary))] max-h-64 overflow-y-auto">
          {generatedCurl}
        </pre>

        <div className="mt-3 pt-3 border-t border-[rgb(var(--border-secondary))] flex flex-wrap gap-2 text-[11px] text-[rgb(var(--text-secondary))]">
          <span className="font-semibold text-[rgb(var(--text-primary))]">Included Headers:</span>
          {IDEMPOTENCY_HEADERS.map((h) => (
            <span key={h} className="px-1.5 py-0.5 rounded bg-[rgb(var(--tint-secondary))] font-mono">
              {h}
            </span>
          ))}
          <span className="px-1.5 py-0.5 rounded bg-[rgb(var(--tint-secondary))] font-mono">
            ?_cb=&lt;uuid&gt;
          </span>
        </div>
      </div>

      <div className="a-panel">
        <div className="flex items-center gap-2 mb-3">
          <ArrowDownToLine className="w-4 h-4 text-[rgb(var(--text-accent))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--text-primary))]">
            Import cURL Command
          </h2>
        </div>

        <p className="text-xs text-[rgb(var(--text-secondary))] mb-3">
          Paste a cURL command copied from Chrome DevTools (Network tab → "Copy as cURL"), Postman, or API documentation. It will automatically populate the target URL, method, headers, and body.
        </p>

        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={`curl -X POST https://your-app.com/api/orders \\\n  -H "Authorization: Bearer token123" \\\n  -H "Content-Type: application/json" \\\n  --data '{"item": "book", "qty": 1}'`}
          rows={5}
          className="w-full p-2.5 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-mono text-[rgb(var(--text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--bg-accent))]"
        />

        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            onClick={handleImport}
            className="a-btn a-btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Parse &amp; Import to Tester
          </button>
          {importStatus && (
            <span
              className={`text-xs ${
                importStatus.includes('failed') || importStatus.includes('No valid')
                  ? 'text-[rgb(var(--text-red))]'
                  : 'text-[rgb(var(--text-green))]'
              }`}
            >
              {importStatus}
            </span>
          )}
        </div>
      </div>

      <div className="a-callout flex items-start gap-3">
        <Info className="w-4 h-4 text-[rgb(var(--text-accent))] shrink-0 mt-0.5" />
        <div className="text-xs text-[rgb(var(--text-secondary))] space-y-1">
          <div className="font-semibold text-[rgb(var(--text-primary))]">
            How Idempotency Bypass Works
          </div>
          <p>
            When web APIs or payment gateways implement idempotency, they store a digest of the <code>Idempotency-Key</code> header or the request body for a time window (e.g. 24 hours).
          </p>
          <p>
            This tester replaces all standard idempotency headers (<code>Idempotency-Key</code>, <code>X-Idempotency-Key</code>, <code>X-Request-Id</code>, <code>X-Correlation-Id</code>, <code>Request-Id</code>) with fresh UUIDs on each attempt, attaches an un-cached <code>_cb</code> query param, and optionally replaces <code>&#123;&#123;uuid&#125;&#125;</code> and <code>&#123;&#123;ts&#125;&#125;</code> inside your request body to bypass body-fingerprint deduplication.
          </p>
        </div>
      </div>
    </div>
  );
};
