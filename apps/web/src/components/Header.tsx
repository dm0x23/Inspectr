import React from 'react';
import { 
  Plus, 
  RefreshCw, 
  ChevronDown
} from 'lucide-react';
import type { Queue, HealthStatus } from '../types';

interface HeaderProps {
  queues: Queue[];
  selectedQueue: Queue | null;
  onSelectQueue: (queue: Queue) => void;
  onOpenCreateModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  health: HealthStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  queues,
  selectedQueue,
  onSelectQueue,
  onOpenCreateModal,
  onRefresh,
  isRefreshing,
  health,
}) => {
  const isHealthy = health?.status === 'healthy';
  const nonDlqQueues = queues.filter((q) => !q.name.endsWith('-dlq'));

  return (
    <header className="border-b border-zinc-800 bg-black/95 backdrop-blur-md sticky top-0 z-40">
      <div className="w-full px-8 sm:px-16 lg:px-24 xl:px-32 2xl:px-40 h-18 sm:h-20 flex items-center justify-between gap-6">
        {/* Left: Clean Wordmark */}
        <div className="flex items-center gap-8 sm:gap-10">
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-bold text-base sm:text-lg text-white tracking-tight">inspectr</span>
            <span className="text-xs uppercase font-mono tracking-wider px-2.5 py-1 rounded border border-zinc-800 text-zinc-400 bg-zinc-950 shrink-0">
              sqs
            </span>
          </div>

          {/* Queue Switcher Dropdown */}
          <div className="relative shrink-0">
            <select
              value={selectedQueue?.name || ''}
              onChange={(e) => {
                const q = queues.find((item) => item.name === e.target.value);
                if (q) onSelectQueue(q);
              }}
              className="appearance-none bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-100 text-sm rounded-md pl-4 pr-11 py-2.5 min-w-[240px] max-w-[340px] truncate focus:outline-none focus:border-zinc-500 transition cursor-pointer font-mono shadow-sm"
            >
              {nonDlqQueues.length === 0 ? (
                <option value="">No queues available</option>
              ) : (
                nonDlqQueues.map((q) => (
                  <option key={q.name} value={q.name}>
                    {q.name} ({q.type}) • {q.stats.totalApproximate}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          </div>
        </div>

        {/* Right: Actions & Status */}
        <div className="flex items-center gap-5 shrink-0">
          {/* Subtle Emerald / Red Redis Status */}
          <div className="hidden sm:flex items-center gap-2.5 text-xs font-mono shrink-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isHealthy
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
              }`}
            />
            <span className={isHealthy ? 'text-zinc-300' : 'text-red-400 font-medium'}>
              {isHealthy ? 'redis connected' : 'redis offline'}
            </span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-3 rounded-md border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 transition disabled:opacity-50 cursor-pointer shrink-0"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Primary High-Contrast "New Queue" Button */}
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-2.5 bg-white hover:bg-zinc-200 text-black text-sm font-semibold px-5 py-2.5 rounded-md transition active:scale-[0.98] cursor-pointer shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Queue</span>
          </button>
        </div>
      </div>
    </header>
  );
};
