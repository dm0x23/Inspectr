import React from 'react';
import { 
  Plus, 
  RefreshCw, 
  Zap, 
  Search, 
  Activity 
} from 'lucide-react';
import type { Queue, HealthStatus } from '../types';
import { QueueSwitcher } from './QueueSwitcher';

interface HeaderProps {
  activeTab: 'simulator' | 'dlq' | 'telemetry';
  onChangeTab: (tab: 'simulator' | 'dlq' | 'telemetry') => void;
  dlqCount?: number;
  queues: Queue[];
  selectedQueue: Queue | null;
  onSelectQueue: (queue: Queue) => void;
  onOpenCreateModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  health: HealthStatus | null;
  onRequestPurgeQueue: (queue: Queue) => void;
  onRequestDeleteQueue: (queue: Queue) => void;
  onCopyArn: (queue: Queue) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onChangeTab,
  dlqCount = 0,
  queues,
  selectedQueue,
  onSelectQueue,
  onOpenCreateModal,
  onRefresh,
  isRefreshing,
  health,
  onRequestPurgeQueue,
  onRequestDeleteQueue,
  onCopyArn,
}) => {
  const isHealthy = health?.status === 'healthy';

  return (
    <header className="border-b border-white/10 bg-zinc-950/70 backdrop-blur-2xl sticky top-0 z-40 border-t border-t-white/20 select-none">
      <div className="w-full px-6 sm:px-10 h-16 sm:h-18 flex items-center justify-between gap-4">
        {/* Left Side: Clean Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-bold text-sm sm:text-base text-white tracking-tight">Inspectr</span>
          <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full border border-white/10 text-zinc-400 bg-white/5 shrink-0">
            sqs
          </span>
        </div>

        {/* Center: Safari / macOS Segmented Pill Control */}
        <div className="hidden md:flex items-center bg-black/40 border border-white/10 rounded-full p-1 backdrop-blur-xl shadow-inner">
          <button
            type="button"
            onClick={() => onChangeTab('simulator')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-white/10 backdrop-blur-sm text-white shadow-sm border border-white/10 font-medium'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>Message Simulator</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('dlq')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
              activeTab === 'dlq'
                ? 'bg-white/10 backdrop-blur-sm text-white shadow-sm border border-white/10 font-medium'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
            <span>DLQ Inspector</span>
            {dlqCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-300 text-[10px] font-mono border border-red-500/30">
                {dlqCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('telemetry')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs rounded-full transition-all cursor-pointer ${
              activeTab === 'telemetry'
                ? 'bg-white/10 backdrop-blur-sm text-white shadow-sm border border-white/10 font-medium'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0 text-blue-400" />
            <span>Telemetry</span>
          </button>
        </div>

        {/* Right Side: Glassy Queue Selector Pill + Status Pill + Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Glassy Queue Selector Pill */}
          <QueueSwitcher
            queues={queues}
            selectedQueue={selectedQueue}
            onSelectQueue={onSelectQueue}
            onOpenCreateModal={onOpenCreateModal}
            onRequestPurgeQueue={onRequestPurgeQueue}
            onRequestDeleteQueue={onRequestDeleteQueue}
            onCopyArn={onCopyArn}
          />

          {/* Connection Status Pill */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono bg-white/5 border border-white/10 rounded-full px-3 py-1 text-zinc-300">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isHealthy
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
              }`}
            />
            <span className="text-[11px]">{isHealthy ? 'redis online' : 'redis offline'}</span>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Primary CTA Glass Pill */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 bg-white/90 hover:bg-white active:scale-[0.98] text-black text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg shadow-white/5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Queue</span>
          </button>
        </div>
      </div>

      {/* Mobile segmented control when screen is narrow */}
      <div className="md:hidden flex items-center justify-center p-2 border-t border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="flex items-center bg-zinc-900/60 border border-white/10 rounded-full p-1 w-full max-w-sm justify-between">
          <button
            type="button"
            onClick={() => onChangeTab('simulator')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs rounded-full transition-all ${
              activeTab === 'simulator'
                ? 'bg-white/10 text-white font-medium border border-white/10'
                : 'text-zinc-400'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Simulator</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('dlq')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs rounded-full transition-all ${
              activeTab === 'dlq'
                ? 'bg-white/10 text-white font-medium border border-white/10'
                : 'text-zinc-400'
            }`}
          >
            <Search className="w-3 h-3" />
            <span>DLQ</span>
            {dlqCount > 0 && <span className="text-[9px] text-red-400 font-mono">({dlqCount})</span>}
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('telemetry')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs rounded-full transition-all ${
              activeTab === 'telemetry'
                ? 'bg-white/10 text-white font-medium border border-white/10'
                : 'text-zinc-400'
            }`}
          >
            <Activity className="w-3 h-3 text-blue-400" />
            <span>Telemetry</span>
          </button>
        </div>
      </div>
    </header>
  );
};
