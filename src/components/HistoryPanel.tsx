import React, { useState } from 'react';
import { History, Copy, Check, Trash2, ArrowUpRight, Download } from 'lucide-react';
import { RequestResult } from '../types';
import { formatTime } from '../utils/idempotency';

interface HistoryItem {
  id: string;
  timestamp: string;
  targetUrl: string;
  method: string;
  results: RequestResult[];
}

interface HistoryPanelProps {
  history: HistoryItem[];
  onClearHistory: () => void;
  onRestoreRun: (item: HistoryItem) => void;
  onSelectResult: (result: RequestResult) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  history,
  onClearHistory,
  onRestoreRun,
  onSelectResult,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyJson = (item: HistoryItem) => {
    navigator.clipboard.writeText(JSON.stringify(item, null, 2));
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traffic-robot-captures-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (history.length === 0) {
    return (
      <div className="a-panel text-center py-12">
        <History className="w-8 h-8 text-[rgb(var(--text-tertiary))] mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-[rgb(var(--text-primary))]">No Saved Captures</h3>
        <p className="text-xs text-[rgb(var(--text-secondary))] mt-1 max-w-sm mx-auto">
          Completed request batches are automatically recorded here for auditing, cURL reproduction, and comparison.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[rgb(var(--text-accent))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--text-primary))]">
            Session History &amp; Captures ({history.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportAll}
            className="a-btn a-btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Export All Captures
          </button>
          <button
            type="button"
            onClick={onClearHistory}
            className="a-btn a-btn-ghost text-xs py-1 px-2.5 text-[rgb(var(--text-red))] hover:bg-[rgb(var(--text-red)/0.08)] flex items-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {history.map((item) => {
          const successCount = item.results.filter(
            (r) => !r.error && (typeof r.status !== 'number' || r.status < 400)
          ).length;
          const total = item.results.length;

          return (
            <div key={item.id} className="a-panel p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold px-2 py-0.5 rounded bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] text-[rgb(var(--text-accent))]">
                    {item.method}
                  </span>
                  <span className="font-mono text-[rgb(var(--text-primary))] truncate max-w-md" title={item.targetUrl}>
                    {item.targetUrl}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[rgb(var(--text-secondary))] font-mono">
                    {formatTime(item.timestamp)}
                  </span>
                  <span
                    className={`font-semibold ${
                      successCount === total ? 'text-[rgb(var(--text-green))]' : 'text-[rgb(var(--text-orange))]'
                    }`}
                  >
                    {successCount}/{total} Succeeded
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[rgb(var(--border-secondary))]">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  {item.results.slice(0, 10).map((r) => {
                    const isBad = Boolean(r.error) || (typeof r.status === 'number' && r.status >= 400);
                    return (
                      <button
                        key={r.n}
                        type="button"
                        onClick={() => onSelectResult(r)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                          isBad
                            ? 'bg-[rgb(var(--text-red)/0.15)] text-[rgb(var(--text-red))] hover:bg-[rgb(var(--text-red)/0.25)]'
                            : 'bg-[rgb(var(--text-green)/0.15)] text-[rgb(var(--text-green))] hover:bg-[rgb(var(--text-green)/0.25)]'
                        }`}
                        title={`#${r.n}: ${r.error ? 'ERR' : r.status} (${r.latency_ms} ms)`}
                      >
                        #{r.n}: {r.error ? 'ERR' : r.status}
                      </button>
                    );
                  })}
                  {item.results.length > 10 && (
                    <span className="text-[10px] text-[rgb(var(--text-secondary))]">
                      +{item.results.length - 10} more
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyJson(item)}
                    className="a-btn a-btn-ghost text-xs py-1 px-2 flex items-center gap-1"
                  >
                    {copiedId === item.id ? <Check className="w-3 h-3 text-[rgb(var(--text-green))]" /> : <Copy className="w-3 h-3" />}
                    {copiedId === item.id ? 'Copied' : 'JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestoreRun(item)}
                    className="a-btn a-btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                  >
                    <ArrowUpRight className="w-3 h-3" />
                    Load in Tester
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
