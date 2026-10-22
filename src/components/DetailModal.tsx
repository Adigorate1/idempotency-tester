import React, { useState } from 'react';
import { X, Check, Copy } from 'lucide-react';
import { RequestResult } from '../types';
import { formatTime } from '../utils/idempotency';

interface DetailModalProps {
  result: RequestResult | null;
  onClose: () => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ result, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!result) return null;

  const isBad = Boolean(result.error) || (typeof result.status === 'number' && result.status >= 400) || result.status === 'ERR';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-secondary))] rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-[rgb(var(--text-primary))]">
        <div className="px-5 py-4 border-b border-[rgb(var(--border-secondary))] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm px-2 py-0.5 rounded bg-[rgb(var(--tint-secondary))] font-semibold">
              #{result.n}
            </span>
            <span
              className={`font-semibold text-sm ${
                isBad ? 'text-[rgb(var(--text-red))]' : 'text-[rgb(var(--text-green))]'
              }`}
            >
              Status: {result.error ? 'ERR' : result.status}
            </span>
            <span className="text-xs text-[rgb(var(--text-secondary))]">
              {result.latency_ms !== null ? `${result.latency_ms} ms` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] rounded-md hover:bg-[rgb(var(--tint-secondary))]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-[rgb(var(--text-secondary))]">Sent at</span>
              <span className="font-mono text-[rgb(var(--text-primary))]">
                {formatTime(result.sent_at)} ({result.sent_at})
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-[rgb(var(--text-secondary))]">Idempotency Key</span>
              <button
                type="button"
                onClick={() => copyToClipboard(result.idempotency_key, 'key')}
                className="flex items-center gap-1 text-[rgb(var(--text-accent))] hover:underline"
              >
                {copiedKey === 'key' ? <Check className="w-3 h-3 text-[rgb(var(--text-green))]" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'key' ? 'Copied' : 'Copy Key'}
              </button>
            </div>
            <div className="p-2.5 rounded bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] font-mono break-all select-all">
              {result.idempotency_key}
            </div>
          </div>

          {result.url_sent && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[rgb(var(--text-secondary))]">URL Sent (with _cb)</span>
              </div>
              <div className="p-2.5 rounded bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] font-mono break-all select-all">
                {result.url_sent}
              </div>
            </div>
          )}

          {result.headers_sent && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[rgb(var(--text-secondary))]">Headers Sent</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(result.headers_sent, null, 2), 'headers')}
                  className="flex items-center gap-1 text-[rgb(var(--text-accent))] hover:underline"
                >
                  {copiedKey === 'headers' ? <Check className="w-3 h-3 text-[rgb(var(--text-green))]" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === 'headers' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-2.5 rounded bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] font-mono whitespace-pre-wrap max-h-36 overflow-auto">
                {JSON.stringify(result.headers_sent, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-[rgb(var(--text-secondary))]">Body Sent</span>
              {result.body_sent && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(result.body_sent, 'body')}
                  className="flex items-center gap-1 text-[rgb(var(--text-accent))] hover:underline"
                >
                  {copiedKey === 'body' ? <Check className="w-3 h-3 text-[rgb(var(--text-green))]" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === 'body' ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            <pre className="p-2.5 rounded bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] font-mono whitespace-pre-wrap max-h-44 overflow-auto">
              {result.body_sent || '<empty>'}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-[rgb(var(--text-secondary))]">Response Content / Error</span>
              <button
                type="button"
                onClick={() => copyToClipboard(result.error || result.response_preview || '', 'resp')}
                className="flex items-center gap-1 text-[rgb(var(--text-accent))] hover:underline"
              >
                {copiedKey === 'resp' ? <Check className="w-3 h-3 text-[rgb(var(--text-green))]" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'resp' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="p-2.5 rounded bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] font-mono whitespace-pre-wrap max-h-56 overflow-auto">
              {result.error || result.response_preview || '<empty response>'}
            </pre>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[rgb(var(--border-secondary))] bg-[rgb(var(--bg-wash))] flex justify-end gap-2">
          <button
            type="button"
            onClick={() => copyToClipboard(JSON.stringify(result, null, 2), 'all')}
            className="a-btn a-btn-ghost text-xs"
          >
            {copiedKey === 'all' ? <Check className="w-3.5 h-3.5 text-[rgb(var(--text-green))]" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedKey === 'all' ? 'Copied JSON' : 'Copy Full Record JSON'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="a-btn a-btn-primary text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
