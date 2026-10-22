import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import { RunMetrics, RequestResult } from '../types';
import { BarChart3 } from 'lucide-react';

interface MetricsBarProps {
  metrics: RunMetrics;
  results?: RequestResult[];
  isRunning: boolean;
  totalPlanned: number;
  onSelectResult?: (result: RequestResult) => void;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({
  metrics,
  results = [],
  isRunning,
  totalPlanned,
  onSelectResult,
}) => {
  const chartData = results.map((r) => ({
    name: `#${r.n}`,
    n: r.n,
    latency: r.latency_ms ?? 0,
    status: r.error ? 'ERR' : String(r.status),
    isError: Boolean(r.error) || (typeof r.status === 'number' && r.status >= 400) || r.status === 'ERR',
    key: r.idempotency_key ? r.idempotency_key.slice(0, 8) : '',
    rawResult: r,
  }));

  const hasLatencyData = results.some((r) => r.latency_ms !== null && r.latency_ms !== undefined);

  return (
    <div className="space-y-4 my-4">
      {/* 4 Standard Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="a-metric">
          <div className="a-metric__label">Sent</div>
          <div className="a-metric__value flex items-baseline gap-1 text-[rgb(var(--text-primary))]">
            <span>{metrics.sent}</span>
            {isRunning && (
              <span className="text-xs font-normal text-[rgb(var(--text-secondary))]">
                / {totalPlanned}
              </span>
            )}
          </div>
        </div>

        <div className="a-metric">
          <div className="a-metric__label">Succeeded</div>
          <div className="a-metric__value text-[rgb(var(--text-green))]">
            {metrics.succeeded}
          </div>
        </div>

        <div className="a-metric">
          <div className="a-metric__label">Failed / blocked</div>
          <div
            className={`a-metric__value ${
              metrics.failed > 0 ? 'text-[rgb(var(--text-red))]' : 'text-[rgb(var(--text-secondary))]'
            }`}
          >
            {metrics.failed}
          </div>
        </div>

        <div className="a-metric">
          <div className="a-metric__label">Median latency</div>
          <div className="a-metric__value text-[rgb(var(--text-primary))]">
            {metrics.medianLatency !== null ? `${metrics.medianLatency} ms` : '—'}
          </div>
        </div>
      </div>

      {/* Latency Bar Chart using Recharts */}
      {hasLatencyData && (
        <div className="a-panel p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--text-primary))]">
              <BarChart3 className="w-3.5 h-3.5 text-[rgb(var(--text-accent))]" />
              <span>Latency per Request (ms)</span>
            </div>
            {metrics.medianLatency !== null && (
              <div className="flex items-center gap-3 text-[11px] text-[rgb(var(--text-secondary))] font-mono">
                {metrics.minLatency !== null && <span>Min: {metrics.minLatency}ms</span>}
                {metrics.maxLatency !== null && <span>Max: {metrics.maxLatency}ms</span>}
                <span className="text-[rgb(var(--text-accent))]">Median: {metrics.medianLatency}ms</span>
              </div>
            )}
          </div>

          <div className="h-44 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 10, left: -20, bottom: 4 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length && onSelectResult) {
                    onSelectResult(e.activePayload[0].payload.rawResult);
                  }
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="opacity-10"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickLine={{ stroke: 'currentColor', opacity: 0.2 }}
                  axisLine={{ stroke: 'currentColor', opacity: 0.2 }}
                  className="text-[rgb(var(--text-secondary))]"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickLine={{ stroke: 'currentColor', opacity: 0.2 }}
                  axisLine={{ stroke: 'currentColor', opacity: 0.2 }}
                  unit="ms"
                  className="text-[rgb(var(--text-secondary))]"
                />
                <Tooltip
                  cursor={{ fill: 'currentColor', opacity: 0.05 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border-secondary))] rounded-md p-2.5 shadow-lg text-xs z-50">
                          <div className="font-semibold text-[rgb(var(--text-primary))] flex items-center justify-between gap-3 mb-1">
                            <span>Request #{data.n}</span>
                            <span
                              className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                data.isError
                                  ? 'bg-[rgb(var(--text-red)/0.12)] text-[rgb(var(--text-red))]'
                                  : 'bg-[rgb(var(--text-green)/0.12)] text-[rgb(var(--text-green))]'
                              }`}
                            >
                              {data.status}
                            </span>
                          </div>
                          <div className="text-[rgb(var(--text-secondary))] flex items-center justify-between gap-4">
                            <span>Latency:</span>
                            <span className="font-mono font-semibold text-[rgb(var(--text-primary))]">
                              {data.latency} ms
                            </span>
                          </div>
                          {data.key && (
                            <div className="text-[10px] text-[rgb(var(--text-tertiary))] font-mono mt-1 pt-1 border-t border-[rgb(var(--border-secondary))]">
                              Key: {data.key}...
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {metrics.medianLatency !== null && (
                  <ReferenceLine
                    y={metrics.medianLatency}
                    stroke="rgb(var(--text-accent))"
                    strokeDasharray="4 4"
                    label={{
                      value: `Median: ${metrics.medianLatency}ms`,
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: 'rgb(var(--text-accent))',
                    }}
                  />
                )}
                <Bar dataKey="latency" radius={[3, 3, 0, 0]} maxBarSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.isError
                          ? 'rgb(var(--text-red))'
                          : 'rgb(var(--bg-accent))'
                      }
                      className="cursor-pointer hover:opacity-85 transition-opacity"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
