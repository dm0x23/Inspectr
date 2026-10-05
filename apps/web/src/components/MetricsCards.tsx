import React from 'react';
import { ArrowRight } from 'lucide-react';
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 lg:gap-10 mb-16 w-full">
      {/* 1. Available Messages */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-md px-8 sm:px-10 lg:px-12 py-8 sm:py-10 lg:py-11 flex flex-col justify-between transition hover:border-zinc-700 shadow-sm">
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase font-mono">
              Available Messages
            </span>
            <span className="flex items-center gap-2 text-xs font-mono text-emerald-400 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span>ready</span>
            </span>
          </div>
          <span className="text-4xl sm:text-5xl font-light font-mono text-white tracking-tight">
            {readyCount}
          </span>
        </div>
        <div className="mt-10 pt-5 border-t border-zinc-900 flex items-center justify-between gap-4 text-sm text-zinc-400 font-mono">
          <span>ready to consume</span>
          <span className="text-zinc-200 uppercase text-xs font-semibold shrink-0">{queue?.type || 'standard'}</span>
        </div>
      </div>

      {/* 2. In-Flight Messages */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-md px-8 sm:px-10 lg:px-12 py-8 sm:py-10 lg:py-11 flex flex-col justify-between transition hover:border-zinc-700 shadow-sm">
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase font-mono">
              In-Flight Messages
            </span>
            <span className="text-xs font-mono text-zinc-400 shrink-0">
              leased
            </span>
          </div>
          <span className="text-4xl sm:text-5xl font-light font-mono text-white tracking-tight">
            {inFlightCount}
          </span>
        </div>
        <div className="mt-10 pt-5 border-t border-zinc-900 flex items-center justify-between gap-4 text-sm text-zinc-400 font-mono">
          <span>lease timeout: {queue?.visibilityTimeout || 30}s</span>
          <span className="text-zinc-200 uppercase text-xs font-semibold shrink-0">processing</span>
        </div>
      </div>

      {/* 3. Dead-Letter Messages */}
      <div className={`bg-zinc-950 border ${dlqCount > 0 ? 'border-red-900/40 hover:border-red-800/60' : 'border-zinc-800 hover:border-zinc-700'} rounded-md px-8 sm:px-10 lg:px-12 py-8 sm:py-10 lg:py-11 flex flex-col justify-between transition shadow-sm`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase font-mono">
                Dead-Letter Queue
              </span>
              {dlqCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0 shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
              )}
            </div>
            <span className={`text-4xl sm:text-5xl font-light font-mono tracking-tight ${dlqCount > 0 ? 'text-red-400' : 'text-white'}`}>
              {dlqCount}
            </span>
          </div>
          {dlqCount > 0 && (
            <button
              onClick={onOpenDLQTab}
              className="flex items-center gap-2 text-xs text-red-300 hover:text-white transition px-3.5 py-2 border border-red-900/60 bg-red-950/40 hover:bg-red-900/50 rounded font-mono cursor-pointer shrink-0 shadow-sm"
            >
              <span>inspect</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>
        <div className="mt-10 pt-5 border-t border-zinc-900 flex items-center justify-between gap-4 text-sm text-zinc-400 font-mono">
          <span>threshold: {queue?.maxReceiveCount || 3} retries</span>
          <span className="text-zinc-200 truncate max-w-[180px] font-mono text-xs shrink-0">{queue ? `${queue.name}-dlq` : 'none'}</span>
        </div>
      </div>
    </div>
  );
};
