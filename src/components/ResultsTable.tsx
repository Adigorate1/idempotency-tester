import React, { useState } from 'react';
import { Check, Download, ExternalLink, Filter } from 'lucide-react';
import { RequestResult } from '../types';
import { formatTime } from '../utils/idempotency';

interface ResultsTableProps {
  results: RequestResult[];
  onSelectResult: (result: RequestResult) => void;
  onClearResults?: () => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  onSelectResult,
  onClearResults,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'success'>('all');

  const handleCopyJson = (e: React.MouseEvent, r: RequestResult, idx: number) => {
    e.stopPropagation();
    const exportData = {
      n: r.n,
      time_sent: r.sent_at,
      key: r.idempotency_key,
      body_sent: r.body_sent,
      status: r.error ? 'ERR' : r.status,
      latency_ms: r.latency_ms,
      response: r.error || r.response_preview,
    };
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1200);
  };

  const filteredResults = results.filter((r) => {
    const isBad = Boolean(r.error) || (typeof r.status === 'number' && r.status >= 400) || r.status === 'ERR';
    if (filterMode === 'errors') return isBad;
    if (filterMode === 'success') return !isBad;
    return true;
  });

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `idempotency-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const headers = ['#', 'sent_at', 'idempotency_key', 'status', 'latency_ms', 'body_sent', 'response'];
    const rows = results.map((r) => [
      r.n,
      `"${r.sent_at}"`,
      `"${r.idempotency_key}"`,
      `"${r.error ? 'ERR' : r.status}"`,
      r.latency_ms ?? '',
      `"${(r.body_sent || '').replace(/"/g, '""')}"`,
      `"${(r.error || r.response_preview || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `idempotency-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (results.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-[rgb(var(--border-secondary))] rounded-lg text-[rgb(var(--text-secondary))] text-xs">
        No requests sent yet. Configure your endpoint above and click "Send requests".
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-[rgb(var(--text-secondary))]" />
          <span className="text-[rgb(var(--text-secondary))] font-medium">Filter:</span>
          <div className="flex rounded border border-[rgb(var(--border-secondary))] overflow-hidden bg-[rgb(var(--bg-wash))]">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 ${filterMode === 'all' ? 'bg-[rgb(var(--bg-elevated))] font-semibold text-[rgb(var(--text-primary))] shadow-xs' : 'text-[rgb(var(--text-secondary))]'}`}
            >
              All ({results.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('success')}
              className={`px-2.5 py-1 ${filterMode === 'success' ? 'bg-[rgb(var(--bg-elevated))] font-semibold text-[rgb(var(--text-green))] shadow-xs' : 'text-[rgb(var(--text-secondary))]'}`}
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('errors')}
              className={`px-2.5 py-1 ${filterMode === 'errors' ? 'bg-[rgb(var(--bg-elevated))] font-semibold text-[rgb(var(--text-red))] shadow-xs' : 'text-[rgb(var(--text-secondary))]'}`}
            >
              Errors
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClearResults && (
            <button
              type="button"
              onClick={onClearResults}
              className="text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] underline text-xs"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={downloadJson}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-[rgb(var(--border-secondary))] bg-[rgb(var(--bg-elevated))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]"
          >
            <Download className="w-3 h-3" />
            JSON
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-[rgb(var(--border-secondary))] bg-[rgb(var(--bg-elevated))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[rgb(var(--border-secondary))] bg-[rgb(var(--bg-elevated))] shadow-xs">
        <table className="a-table">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th className="w-24">Time sent</th>
              <th className="min-w-[160px]">Key sent</th>
              <th className="min-w-[160px]">Body sent</th>
              <th className="w-20">Status</th>
              <th className="w-20">Latency</th>
              <th className="min-w-[200px]">Response</th>
              <th className="w-20 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((r, idx) => {
              const isBad = Boolean(r.error) || (typeof r.status === 'number' && r.status >= 400) || r.status === 'ERR';
              return (
                <tr
                  key={`${r.n}-${r.sent_at}-${idx}`}
                  onClick={() => onSelectResult(r)}
                  className="cursor-pointer hover:bg-[rgb(var(--tint-tertiary))] transition-colors"
                  title="Click to view full request and response details"
                >
                  <td className="font-mono text-xs font-semibold text-[rgb(var(--text-secondary))]">
                    {r.n}
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap text-[rgb(var(--text-secondary))]">
                    <span title={r.sent_at}>{formatTime(r.sent_at)}</span>
                  </td>
                  <td className="font-mono text-xs text-[rgb(var(--text-accent))] truncate max-w-[220px]" title={r.idempotency_key}>
                    {r.idempotency_key}
                  </td>
                  <td className="max-w-[200px]">
                    <pre className="font-mono text-[11px] text-[rgb(var(--text-secondary))] truncate m-0">
                      {r.body_sent || '—'}
                    </pre>
                  </td>
                  <td className="whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium font-mono ${
                        isBad
                          ? 'bg-[rgb(var(--text-red)/0.12)] text-[rgb(var(--text-red))]'
                          : 'bg-[rgb(var(--text-green)/0.12)] text-[rgb(var(--text-green))]'
                      }`}
                    >
                      {r.error ? 'ERR' : r.status}
                    </span>
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap text-[rgb(var(--text-secondary))]">
                    {r.latency_ms !== null && r.latency_ms !== undefined ? `${r.latency_ms} ms` : '—'}
                  </td>
                  <td className="max-w-[280px]">
                    <pre className="font-mono text-[11px] text-[rgb(var(--text-secondary))] truncate m-0" title={r.error || r.response_preview}>
                      {r.error || r.response_preview || '—'}
                    </pre>
                  </td>
                  <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleCopyJson(e, r, idx)}
                        className="px-2 py-1 rounded text-[11px] font-medium border border-[rgb(var(--border-secondary))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--tint-secondary))]"
                        title="Copy JSON representation"
                      >
                        {copiedIndex === idx ? (
                          <span className="text-[rgb(var(--text-green))] flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Copied
                          </span>
                        ) : (
                          'JSON'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectResult(r)}
                        className="p-1 rounded text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--tint-secondary))]"
                        title="Open full inspector"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
