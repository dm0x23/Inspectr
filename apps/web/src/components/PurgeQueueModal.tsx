import React, { useState } from 'react';
import { X, AlertTriangle, Flame, Loader2 } from 'lucide-react';
import type { Queue } from '../types';

interface PurgeQueueModalProps {
  isOpen: boolean;
  queue: Queue | null;
  onClose: () => void;
  onConfirmPurge: (queueName: string) => Promise<void>;
}

export const PurgeQueueModal: React.FC<PurgeQueueModalProps> = ({
  isOpen,
  queue,
  onClose,
  onConfirmPurge,
}) => {
  const [isPurging, setIsPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !queue) return null;

  const totalMessages = queue.stats.readyCount + queue.stats.inFlightCount;

  const handlePurge = async () => {
    setIsPurging(true);
    setError(null);
    try {
      await onConfirmPurge(queue.name);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to purge queue');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-900/90 backdrop-blur-3xl border border-white/15 border-t-white/25 shadow-2xl p-6 sm:p-8 overflow-hidden ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-amber-400">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Purge Queue Messages</h3>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">{queue.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPurging}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="py-5 space-y-4 text-xs font-mono">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 font-sans text-xs">
              <p className="font-semibold text-amber-100">
                This will permanently delete all messages in this queue.
              </p>
              <p className="text-amber-200/80 leading-relaxed">
                All ready messages and currently in-flight messages will be removed from Redis storage. The queue configuration itself will remain intact.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-white/10 bg-black/40 shadow-inner">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Queue Type</span>
              <span className="text-white uppercase font-bold">{queue.type}</span>
            </div>
            <div className="p-3 rounded-xl border border-white/10 bg-black/40 shadow-inner">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Pending Messages</span>
              <span className="text-white font-bold">{totalMessages} msgs</span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isPurging}
            className="px-4 py-1.5 text-xs font-medium rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePurge}
            disabled={isPurging}
            className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-semibold rounded-full bg-white/90 hover:bg-white text-black transition active:scale-[0.98] cursor-pointer shadow-lg shadow-white/5 disabled:opacity-40"
          >
            {isPurging ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Purging...</span>
              </>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5" />
                <span>Purge Messages</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
