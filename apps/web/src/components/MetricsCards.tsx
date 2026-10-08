import React from 'react';
import { ArrowRight, Layers, Clock, AlertTriangle } from 'lucide-react';
import type { Queue } from '../types';

interface MetricsCardsProps {
  queue: Queue | null;
  onOpenDLQTab: () => void;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ queue, onOpenDLQTab }) => {
  const readyCount = queue?.stats.readyCount ?? 0;
  const inFlightCount = queue?.stats.inFlightCount ?? 0;
  const dlqCount = queue?.stats.dlqCount ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 lg:gap-8 mb-12 sm:mb-16 w-full">
      {/* 1. Available Messages Card */}
      <div className="bg-white/[0.03] hover:bg-white/[0.05] backdrop-blur-md border border-white/[0.08] border-t-white/20 hover:border-white/15 rounded-2xl p-7 sm:p-8 flex flex-col justify-between transition-all duration-200 shadow-xl shadow-black/40 group relative overflow-hidden">
        {/* Subtle Ambient Radial Highlight */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-[10px] text-zinc-400 tracking-widest font-semibold uppercase font-mono">
              Available Messages
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span>ready</span>
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-4xl sm:text-5xl font-light font-mono text-white tracking-tight drop-shadow-[0_0_12px_rgba(255,255,255,0.12)]">
              {readyCount}
            </span>
            {/* Subtle Apple-style mini sparkline */}
            <div className="flex items-end gap-1 h-6 opacity-60 group-hover:opacity-100 transition-opacity">
              <div className="w-1 bg-white/20 rounded-full h-2" />
              <div className="w-1 bg-white/30 rounded-full h-3" />
              <div className="w-1 bg-white/40 rounded-full h-5" />
              <div className="w-1 bg-emerald-400 rounded-full h-4 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between gap-4 text-xs text-zinc-400 font-mono">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            <span>ready to consume</span>
          </span>
          <span className="text-zinc-300 uppercase text-[10px] font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/5">
            {queue?.type || 'standard'}
          </span>
        </div>
      </div>

      {/* 2. In-Flight Messages Card */}
      <div className="bg-white/[0.03] hover:bg-white/[0.05] backdrop-blur-md border border-white/[0.08] border-t-white/20 hover:border-white/15 rounded-2xl p-7 sm:p-8 flex flex-col justify-between transition-all duration-200 shadow-xl shadow-black/40 group relative overflow-hidden">
        {/* Subtle Ambient Radial Highlight */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-[10px] text-zinc-400 tracking-widest font-semibold uppercase font-mono">
              In-Flight Messages
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
              <span>leased</span>
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-4xl sm:text-5xl font-light font-mono text-white tracking-tight drop-shadow-[0_0_12px_rgba(255,255,255,0.12)]">
              {inFlightCount}
            </span>
            <div className="flex items-end gap-1 h-6 opacity-60 group-hover:opacity-100 transition-opacity">
              <div className="w-1 bg-white/20 rounded-full h-3" />
              <div className="w-1 bg-white/30 rounded-full h-4" />
              <div className="w-1 bg-amber-400 rounded-full h-6 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
              <div className="w-1 bg-white/20 rounded-full h-2" />
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between gap-4 text-xs text-zinc-400 font-mono">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span>lease: {queue?.visibilityTimeout || 30}s</span>
          </span>
          <span className="text-zinc-300 uppercase text-[10px] font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/5">
            processing
          </span>
        </div>
      </div>

      {/* 3. Dead-Letter Messages Card */}
      <div className={`bg-white/[0.03] hover:bg-white/[0.05] backdrop-blur-md border ${
        dlqCount > 0 ? 'border-red-500/25 border-t-red-400/30 shadow-[0_0_20px_rgba(239,68,68,0.08)]' : 'border-white/[0.08] border-t-white/20'
      } hover:border-white/15 rounded-2xl p-7 sm:p-8 flex flex-col justify-between transition-all duration-200 shadow-xl shadow-black/40 group relative overflow-hidden`}>
        {/* Subtle Ambient Radial Highlight */}
        {dlqCount > 0 && (
          <div className="absolute top-0 right-0 w-36 h-36 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
        )}

        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-[10px] text-zinc-400 tracking-widest font-semibold uppercase font-mono">
              Dead-Letter Queue
            </span>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono ${
              dlqCount > 0
                ? 'bg-red-500/15 border border-red-500/30 text-red-300'
                : 'bg-white/5 border border-white/10 text-zinc-400'
            }`}>
              {dlqCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
              )}
              <span>{dlqCount > 0 ? 'alert' : 'quarantined'}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-4xl sm:text-5xl font-light font-mono tracking-tight ${
              dlqCount > 0 ? 'text-red-400 drop-shadow-[0_0_14px_rgba(248,113,113,0.3)]' : 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.12)]'
            }`}>
              {dlqCount}
            </span>

            {dlqCount > 0 && (
              <button
                type="button"
                onClick={onOpenDLQTab}
                className="flex items-center gap-1.5 text-xs text-red-300 hover:text-white transition px-3.5 py-1.5 border border-red-500/30 hover:border-red-500/50 bg-red-500/10 hover:bg-red-500/20 rounded-full font-mono cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <span>inspect</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between gap-4 text-xs text-zinc-400 font-mono">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />
            <span>threshold: {queue?.maxReceiveCount || 3} tries</span>
          </span>
          <span className="text-zinc-300 truncate max-w-[150px] text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5">
            {queue ? `${queue.name}-dlq` : 'none'}
          </span>
        </div>
      </div>
    </div>
  );
};
