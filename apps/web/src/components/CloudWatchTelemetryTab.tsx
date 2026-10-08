import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  RefreshCw,
  Zap,
  Flame,
  Activity,
  Layers,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import type { Queue, QueueMetricPoint } from '../types';
import { ApiClient } from '../api/client';

interface CloudWatchTelemetryTabProps {
  queue: Queue | null;
  onRefreshAll?: () => void;
}

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/15 rounded-xl px-3.5 py-2.5 shadow-2xl font-mono text-xs space-y-1.5 z-50 pointer-events-none ring-1 ring-white/10">
      <div className="text-zinc-400 pb-1 border-b border-white/10 font-medium text-[11px]">{label}</div>
      {payload.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4">
          <span className="text-zinc-300 flex items-center gap-1.5 text-[11px]">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            {item.name}:
          </span>
          <span className="text-white font-semibold text-[11px]">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

export const CloudWatchTelemetryTab: React.FC<CloudWatchTelemetryTabProps> = ({
  queue,
  onRefreshAll,
}) => {
  const [metrics, setMetrics] = useState<QueueMetricPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isBursting, setIsBursting] = useState(false);
  const [isPoisoning, setIsPoisoning] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!queue) {
      setMetrics([]);
      return;
    }

    try {
      const data = await ApiClient.getMetrics(queue.name, 30);
      setMetrics(data);
    } catch (err: unknown) {
      console.error('Failed to load telemetry metrics:', err);
    }
  }, [queue]);

  useEffect(() => {
    loadMetrics();

    if (!autoRefresh || !queue) return;

    const interval = setInterval(() => {
      loadMetrics();
    }, 2000);

    return () => clearInterval(interval);
  }, [loadMetrics, autoRefresh, queue]);

  const handleManualRefresh = async () => {
    setIsLoading(true);
    await loadMetrics();
    setIsLoading(false);
  };

  const handleSimulateBurst = async () => {
    if (!queue) return;
    setIsBursting(true);
    try {
      await ApiClient.sendBurst(queue.name, 25);
      setActionNotice('Burst generated: 25 messages pipelined into queue');
      setTimeout(() => setActionNotice(null), 3000);
      await loadMetrics();
      onRefreshAll?.();
    } catch (err: unknown) {
      setActionNotice(err instanceof Error ? err.message : 'Burst failed');
      setTimeout(() => setActionNotice(null), 4000);
    } finally {
      setIsBursting(false);
    }
  };

  const handleInjectPoison = async () => {
    if (!queue) return;
    setIsPoisoning(true);
    try {
      await ApiClient.sendMessage(queue.name, {
        orderId: null,
        simulateError: 'TypeError',
        failProcessing: true,
      });
      setActionNotice('Poison pill enqueued: Worker will auto-fail with TypeError');
      setTimeout(() => setActionNotice(null), 3000);
      await loadMetrics();
      onRefreshAll?.();
    } catch (err: unknown) {
      setActionNotice(err instanceof Error ? err.message : 'Poison injection failed');
      setTimeout(() => setActionNotice(null), 4000);
    } finally {
      setIsPoisoning(false);
    }
  };

  const latestPoint = metrics[metrics.length - 1];
  const currentVisible = latestPoint?.ApproximateNumberOfMessagesVisible ?? queue?.stats.readyCount ?? 0;
  const currentInFlight = latestPoint?.ApproximateNumberOfMessagesNotVisible ?? queue?.stats.inFlightCount ?? 0;

  const totalSent = metrics.reduce((acc, curr) => acc + (curr.NumberOfMessagesSent || 0), 0);
  const totalReceived = metrics.reduce((acc, curr) => acc + (curr.NumberOfMessagesReceived || 0), 0);
  const totalDeleted = metrics.reduce((acc, curr) => acc + (curr.NumberOfMessagesDeleted || 0), 0);
  const totalDeadLettered = metrics.reduce((acc, curr) => acc + (curr.NumberOfMessagesDeadLettered || 0), 0);

  return (
    <div className="space-y-8 w-full mb-16">
      {/* Top Telemetry Header Bar */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 rounded-2xl p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5 font-mono">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              CloudWatch Telemetry
            </h2>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-zinc-300 font-mono shrink-0">
              rolling 60s
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono">
            Queue: <span className="text-white font-medium">{queue?.name || 'none'}</span> • 2-second resolution
          </p>
        </div>

        {/* Live Controls: 2s Auto-Refresh Toggle + Chaos Fast Triggers */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-mono transition cursor-pointer shadow-sm ${
              autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                autoRefresh
                  ? 'bg-emerald-400 animate-ping shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-zinc-600'
              }`}
            />
            <span>{autoRefresh ? '2s live feed' : 'paused'}</span>
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isLoading || !queue}
            className="p-2 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-40 shrink-0"
            title="Refresh metrics now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-white' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleSimulateBurst}
            disabled={isBursting || !queue}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-mono font-medium transition cursor-pointer disabled:opacity-40 shadow-sm shrink-0"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${isBursting ? 'animate-spin text-white' : ''}`} />
            <span>{isBursting ? 'Bursting...' : 'Burst (25)'}</span>
          </button>

          <button
            type="button"
            onClick={handleInjectPoison}
            disabled={isPoisoning || !queue}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-red-500/30 hover:border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-mono font-medium transition cursor-pointer disabled:opacity-40 shadow-sm shrink-0"
          >
            <Flame className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>{isPoisoning ? 'Injecting...' : 'Poison Pill'}</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-200 text-xs font-mono flex items-center gap-2.5 animate-in fade-in duration-150 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Real-Time Key Stat Badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold">Queue Depth</span>
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-2xl font-light text-white font-mono">
            {currentVisible} <span className="text-xs text-zinc-500 font-normal">ready</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-2">
            In-flight: <span className="text-white font-medium">{currentInFlight}</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold">Enqueued (60s)</span>
            <TrendingUp className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="text-2xl font-light text-white font-mono">
            {totalSent} <span className="text-xs text-zinc-500 font-normal">sent</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-2">
            Rate: <span className="text-white font-medium">{(totalSent / 60).toFixed(1)}/s</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold">Processed (60s)</span>
            <Activity className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-2xl font-light text-white font-mono">
            {totalReceived} <span className="text-xs text-zinc-500 font-normal">polled</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-2">
            Acked: <span className="text-white font-medium">{totalDeleted}</span>
          </div>
        </div>

        <div className={`p-5 rounded-2xl bg-white/[0.03] backdrop-blur-md border ${
          totalDeadLettered > 0 ? 'border-red-500/30' : 'border-white/[0.08]'
        } border-t-white/15 flex flex-col justify-between shadow-xl`}>
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold">DLQ Routed (60s)</span>
            <AlertTriangle className={`w-3.5 h-3.5 ${totalDeadLettered > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
          </div>
          <div className={`text-2xl font-light font-mono ${totalDeadLettered > 0 ? 'text-red-400' : 'text-white'}`}>
            {totalDeadLettered} <span className="text-xs text-zinc-500 font-normal">failed</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-2">
            Threshold: <span className="text-white font-medium">{queue?.maxReceiveCount || 3} tries</span>
          </div>
        </div>
      </div>

      {/* ================= 3 AWS CLOUDWATCH LINE CHARTS ================= */}
      <div className="space-y-8">
        {/* CHART 1: Queue Depth */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 rounded-2xl p-6 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/5 gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-sm font-mono tracking-tight">
                  Queue Depth
                </h3>
                <span className="text-[10px] font-mono text-zinc-500">
                  (ApproximateNumberOfMessagesVisible vs In-Flight)
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Backlog depth of messages waiting to be polled versus currently leased by workers.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                <span className="w-3.5 h-0.5 bg-white inline-block rounded-full" />
                <span>Visible ({currentVisible})</span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                <span className="w-3.5 h-0.5 border-b-2 border-dashed border-zinc-500 inline-block" />
                <span>In-Flight ({currentInFlight})</span>
              </div>
            </div>
          </div>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="ApproximateNumberOfMessagesVisible"
                  name="Visible (Ready)"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#ffffff', stroke: '#000000', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="ApproximateNumberOfMessagesNotVisible"
                  name="In-Flight (Leased)"
                  stroke="#a1a1aa"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#a1a1aa', stroke: '#000000', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Message Throughput */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 rounded-2xl p-6 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/5 gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-sm font-mono tracking-tight">
                  Message Throughput
                </h3>
                <span className="text-[10px] font-mono text-zinc-500">
                  (NumberOfMessagesSent vs NumberOfMessagesReceived per 2s bucket)
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Ingestion velocity compared with consumer processing throughput.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                <span className="w-3.5 h-0.5 bg-white inline-block rounded-full" />
                <span>Sent ({totalSent})</span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                <span className="w-3.5 h-0.5 border-b-2 border-dashed border-zinc-500 inline-block" />
                <span>Polled ({totalReceived})</span>
              </div>
            </div>
          </div>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesSent"
                  name="Messages Sent"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#ffffff', stroke: '#000000', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesReceived"
                  name="Messages Polled"
                  stroke="#a1a1aa"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#a1a1aa', stroke: '#000000', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 3: Error Rate & DLQ Migration */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 rounded-2xl p-6 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/5 gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-sm font-mono tracking-tight">
                  Error &amp; DLQ Migration Rate
                </h3>
                <span className="text-[10px] font-mono text-zinc-500">
                  (NumberOfMessagesDeleted vs NumberOfMessagesDeadLettered)
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Successful processing acknowledgements compared with poison pill quarantines.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                <span className="w-3.5 h-0.5 bg-white inline-block rounded-full" />
                <span>ACKed ({totalDeleted})</span>
              </div>
              <div className="flex items-center gap-1.5 text-red-400 text-[11px]">
                <span className="w-3.5 h-0.5 bg-red-400 inline-block rounded-full shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
                <span>DLQ ({totalDeadLettered})</span>
              </div>
            </div>
          </div>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesDeleted"
                  name="Messages ACKed"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#ffffff', stroke: '#000000', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesDeadLettered"
                  name="Dead-Lettered"
                  stroke="#f87171"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#f87171' }}
                  activeDot={{ r: 5, fill: '#f87171', stroke: '#000000', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
