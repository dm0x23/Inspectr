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
    <div className="bg-black border border-zinc-800 px-3.5 py-2.5 rounded-md shadow-2xl font-mono text-xs space-y-1.5 z-50 pointer-events-none">
      <div className="text-zinc-500 pb-1 border-b border-zinc-900 font-medium">{label}</div>
      {payload.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            {item.name}:
          </span>
          <span className="text-white font-semibold">{item.value}</span>
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

  // Initial fetch and auto-refresh loop (2 seconds)
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
      const poisonPayload = {
        orderId: null,
        simulateError: 'TypeError',
        failProcessing: true,
      };
      await ApiClient.sendMessage(
        queue.name,
        poisonPayload,
        queue.type === 'fifo' ? 'chaos-stream' : undefined
      );
      setActionNotice('Poison pill enqueued: will trigger TypeError on consumer poll');
      setTimeout(() => setActionNotice(null), 3500);
      await loadMetrics();
      onRefreshAll?.();
    } catch (err: unknown) {
      setActionNotice(err instanceof Error ? err.message : 'Poison pill injection failed');
      setTimeout(() => setActionNotice(null), 4000);
    } finally {
      setIsPoisoning(false);
    }
  };

  // Latest snapshot metrics
  const latestPoint = metrics[metrics.length - 1];
  const totalSent = metrics.reduce((acc, p) => acc + p.NumberOfMessagesSent, 0);
  const totalReceived = metrics.reduce((acc, p) => acc + p.NumberOfMessagesReceived, 0);
  const totalDeleted = metrics.reduce((acc, p) => acc + p.NumberOfMessagesDeleted, 0);
  const totalDeadLettered = metrics.reduce((acc, p) => acc + p.NumberOfMessagesDeadLettered, 0);

  const currentVisible = latestPoint?.ApproximateNumberOfMessagesVisible ?? queue?.stats.readyCount ?? 0;
  const currentInFlight = latestPoint?.ApproximateNumberOfMessagesNotVisible ?? queue?.stats.inFlightCount ?? 0;

  return (
    <div className="space-y-10 sm:space-y-12 w-full mb-20">
      {/* Top Telemetry Header & Controls */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-md px-8 sm:px-10 lg:px-12 py-8 sm:py-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-2 font-mono">
            <Activity className="w-5 h-5 text-white shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              CloudWatch Real-Time Telemetry
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 font-mono">
              60s rolling window • 2s resolution
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 font-mono">
            Queue: <span className="text-white font-medium">{queue?.name || 'none'}</span> ({queue?.type || 'standard'})
            • Leases: <span className="text-zinc-200 font-medium">{queue?.visibilityTimeout || 30}s VT</span>
          </p>
        </div>

        {/* Right Toolbar: Auto-refresh Toggle + Chaos Stress Buttons */}
        <div className="flex items-center gap-3.5 flex-wrap shrink-0">
          {/* Auto-Refresh Toggle with Blinking Indicator */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 font-mono text-xs transition cursor-pointer shrink-0 shadow-sm"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                autoRefresh
                  ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-pulse'
                  : 'bg-zinc-600'
              }`}
            />
            <span className="text-zinc-400">Auto-refresh (2s):</span>
            <span className={autoRefresh ? 'text-white font-bold' : 'text-zinc-500 font-medium'}>
              {autoRefresh ? 'ACTIVE' : 'PAUSED'}
            </span>
          </button>

          {/* Manual Refresh */}
          <button
            onClick={handleManualRefresh}
            disabled={isLoading || !queue}
            className="p-2.5 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-40 shrink-0"
            title="Refresh metrics now"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-white' : ''}`} />
          </button>

          {/* Fast Stress Action: Burst */}
          <button
            onClick={handleSimulateBurst}
            disabled={isBursting || !queue}
            className="flex items-center gap-2 px-3.5 py-2 rounded border border-zinc-700 hover:border-zinc-500 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white text-xs font-mono font-medium transition cursor-pointer disabled:opacity-40 shadow-sm shrink-0"
          >
            <Zap className={`w-3.5 h-3.5 text-white ${isBursting ? 'animate-spin' : ''}`} />
            <span>{isBursting ? 'Bursting...' : 'Stress Burst (25)'}</span>
          </button>

          {/* Fast Chaos Action: Poison Pill */}
          <button
            onClick={handleInjectPoison}
            disabled={isPoisoning || !queue}
            className="flex items-center gap-2 px-3.5 py-2 rounded border border-red-900/60 hover:border-red-800 bg-red-950/20 hover:bg-red-950/50 text-red-300 hover:text-red-200 text-xs font-mono font-medium transition cursor-pointer disabled:opacity-40 shadow-sm shrink-0"
          >
            <Flame className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>{isPoisoning ? 'Injecting...' : 'Inject Poison'}</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="p-4 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono flex items-center gap-3 animate-in fade-in duration-150">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Real-Time Key Stat Badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 font-mono text-xs">
        <div className="p-5 rounded-md bg-zinc-950 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="uppercase tracking-wider">Queue Depth</span>
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-2xl font-light text-white font-mono">
            {currentVisible} <span className="text-xs text-zinc-500 font-normal">ready</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">
            In-flight: <span className="text-zinc-300 font-medium">{currentInFlight}</span>
          </div>
        </div>

        <div className="p-5 rounded-md bg-zinc-950 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="uppercase tracking-wider">Enqueued (60s)</span>
            <TrendingUp className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="text-2xl font-light text-white font-mono">
            {totalSent} <span className="text-xs text-zinc-500 font-normal">sent</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">
            Rate: <span className="text-zinc-300 font-medium">{(totalSent / 60).toFixed(1)}/s</span>
          </div>
        </div>

        <div className="p-5 rounded-md bg-zinc-950 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="uppercase tracking-wider">Processed (60s)</span>
            <Activity className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-2xl font-light text-white font-mono">
            {totalReceived} <span className="text-xs text-zinc-500 font-normal">polled</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">
            Acked: <span className="text-zinc-300 font-medium">{totalDeleted}</span>
          </div>
        </div>

        <div className={`p-5 rounded-md bg-zinc-950 border ${totalDeadLettered > 0 ? 'border-red-900/60' : 'border-zinc-800'} flex flex-col justify-between`}>
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="uppercase tracking-wider">DLQ Routed (60s)</span>
            <AlertTriangle className={`w-3.5 h-3.5 ${totalDeadLettered > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
          </div>
          <div className={`text-2xl font-light font-mono ${totalDeadLettered > 0 ? 'text-red-400' : 'text-white'}`}>
            {totalDeadLettered} <span className="text-xs text-zinc-500 font-normal">failed</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">
            Threshold: <span className="text-zinc-300 font-medium">{queue?.maxReceiveCount || 3} tries</span>
          </div>
        </div>
      </div>

      {/* ================= 3 AWS CLOUDWATCH LINE CHARTS ================= */}
      <div className="space-y-10">
        {/* CHART 1: Queue Depth (ApproximateNumberOfMessagesVisible vs In-Flight) */}
        <div className="bg-black border border-zinc-800 rounded-md p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-zinc-900 gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm font-mono tracking-tight">
                  Queue Depth
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  (ApproximateNumberOfMessagesVisible vs In-Flight)
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-1">
                Backlog depth of messages waiting to be polled versus currently leased by workers.
              </p>
            </div>

            {/* Custom Legend */}
            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="w-4 h-0.5 bg-white inline-block" />
                <span>Visible ({currentVisible})</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="w-4 h-0.5 border-b-2 border-dashed border-zinc-500 inline-block" />
                <span>In-Flight ({currentInFlight})</span>
              </div>
            </div>
          </div>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#52525b"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                />
                <YAxis
                  stroke="#52525b"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Crisp White Line for Incoming/Ready Traffic */}
                <Line
                  type="monotone"
                  dataKey="ApproximateNumberOfMessagesVisible"
                  name="Visible (Ready)"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {/* Dashed Zinc Line for Consumers / In-Flight */}
                <Line
                  type="monotone"
                  dataKey="ApproximateNumberOfMessagesNotVisible"
                  name="In-Flight (Leased)"
                  stroke="#71717a"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Message Throughput (Sent vs Received per bucket) */}
        <div className="bg-black border border-zinc-800 rounded-md p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-zinc-900 gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm font-mono tracking-tight">
                  Message Throughput
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  (NumberOfMessagesSent vs NumberOfMessagesReceived per second)
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-1">
                Traffic ingestion rate from producers compared to consumer retrieval velocity.
              </p>
            </div>

            {/* Custom Legend */}
            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="w-4 h-0.5 bg-white inline-block" />
                <span>Sent ({totalSent})</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="w-4 h-0.5 border-b-2 border-dashed border-zinc-400 inline-block" />
                <span>Received ({totalReceived})</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="w-4 h-0.5 border-b border-dotted border-zinc-600 inline-block" />
                <span>Deleted ({totalDeleted})</span>
              </div>
            </div>
          </div>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#52525b"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                />
                <YAxis
                  stroke="#52525b"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Crisp White Line for Incoming Traffic (Sent) */}
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesSent"
                  name="Sent"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {/* Dashed Zinc Line for Consumer Pulled Traffic (Received) */}
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesReceived"
                  name="Received"
                  stroke="#a1a1aa"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {/* Dotted Zinc Line for Acknowledged/Deleted Traffic */}
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesDeleted"
                  name="Deleted (ACK)"
                  stroke="#52525b"
                  strokeDasharray="2 2"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 3: Error Rate & DLQ Migration Rate */}
        <div className="bg-black border border-zinc-800 rounded-md p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-zinc-900 gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm font-mono tracking-tight">
                  Error Rate & DLQ Migration
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  (NumberOfMessagesDeadLettered)
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-1">
                Messages routed to dead-letter storage due to retry threshold exhaustion or poison pill crashes.
              </p>
            </div>

            {/* Custom Legend */}
            <div className="flex items-center gap-2 text-xs font-mono text-red-400 shrink-0">
              <span className="w-4 h-0.5 bg-red-400 inline-block shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
              <span>Dead-Lettered ({totalDeadLettered})</span>
            </div>
          </div>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#52525b"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                />
                <YAxis
                  stroke="#52525b"
                  fontSize={10}
                  fontFamily="monospace"
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Red Alert Line for Dead-Lettered / Failed Messages */}
                <Line
                  type="monotone"
                  dataKey="NumberOfMessagesDeadLettered"
                  name="Dead-Lettered"
                  stroke="#f87171"
                  strokeWidth={2}
                  dot={false}
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
