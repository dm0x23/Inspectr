import React, { useState } from 'react';
import { X, AlertOctagon, Trash2, Loader2 } from 'lucide-react';
import type { Queue } from '../types';

interface DeleteQueueModalProps {
  isOpen: boolean;
  queue: Queue | null;
  onClose: () => void;
  onConfirmDelete: (queueName: string) => Promise<void>;
}

export const DeleteQueueModal: React.FC<DeleteQueueModalProps> = ({
  isOpen,
  queue,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !queue) return null;

  const requiresInputMatch = true;
  const isMatch = confirmName.trim() === queue.name;

  const handleDelete = async () => {
    if (requiresInputMatch && !isMatch) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirmDelete(queue.name);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete queue');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-900/90 backdrop-blur-3xl border border-white/15 border-t-white/25 shadow-2xl p-6 sm:p-8 overflow-hidden ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertOctagon className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Delete Queue</h3>
              <p className="text-xs text-red-400 font-mono mt-0.5">Danger Action</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="py-5 space-y-4 text-xs font-mono">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 font-sans space-y-2">
            <p className="font-semibold text-red-200">
              Are you sure you want to delete <span className="font-mono text-white underline">{queue.name}</span>? This cannot be undone.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              All messages in this queue and any companion Dead Letter Queue (<span className="font-mono text-zinc-300">{queue.name}-dlq</span>) will be permanently purged and deleted from Redis.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-zinc-400 text-xs block font-sans">
              To confirm, type <span className="text-white font-mono font-bold select-all">{queue.name}</span> below:
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={queue.name}
              disabled={isDeleting}
              autoFocus
              className="w-full bg-black/50 border border-white/10 focus:border-red-500/60 rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-zinc-700 focus:outline-none transition shadow-inner"
            />
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-1.5 text-xs font-medium rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isMatch || isDeleting}
            className="flex items-center gap-1.5 px-5 py-1.5 text-xs font-semibold rounded-full bg-red-500 hover:bg-red-600 text-white transition active:scale-[0.98] cursor-pointer shadow-lg shadow-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Queue</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
