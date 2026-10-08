import React, { useState } from 'react';
import { X, AlertCircle, Layers } from 'lucide-react';
import type { CreateQueueData, QueueType } from '../types';

interface CreateQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateQueueData) => Promise<void>;
}

export const CreateQueueModal: React.FC<CreateQueueModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<QueueType>('standard');
  const [visibilityTimeout, setVisibilityTimeout] = useState(30);
  const [maxReceiveCount, setMaxReceiveCount] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTypeChange = (newType: QueueType) => {
    setType(newType);
    if (newType === 'fifo') {
      if (!name.endsWith('.fifo')) {
        setName((prev) => (prev ? `${prev.replace(/\.fifo$/, '')}.fifo` : 'orders.fifo'));
      }
    } else {
      if (name.endsWith('.fifo')) {
        setName((prev) => prev.replace(/\.fifo$/, ''));
      }
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (val.endsWith('.fifo') && type !== 'fifo') {
      setType('fifo');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Queue name is required');
      return;
    }

    let finalName = trimmedName;
    if (type === 'fifo' && !finalName.endsWith('.fifo')) {
      finalName = `${finalName}.fifo`;
      setName(finalName);
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: finalName,
        type,
        visibilityTimeout,
        maxReceiveCount,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create queue');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-900/90 backdrop-blur-3xl border border-white/15 border-t-white/25 shadow-2xl p-7 sm:p-9 overflow-hidden ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-white">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Create Queue</h3>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">Configure new simulated distributed queue</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs flex items-center gap-2.5 font-mono shadow-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5 text-xs font-mono">
          {/* FIFO Queue Switch Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-black/30 shadow-inner">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-white text-xs">FIFO Queue</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border ${
                    type === 'fifo'
                      ? 'bg-white/15 border-white/20 text-white'
                      : 'bg-white/5 border-white/5 text-zinc-400'
                  }`}
                >
                  {type === 'fifo' ? '.fifo enforced' : 'standard queue'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 font-sans leading-relaxed">
                Strict FIFO delivery order with 5-minute SHA-256 deduplication.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={type === 'fifo'}
              onClick={() => handleTypeChange(type === 'fifo' ? 'standard' : 'fifo')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                type === 'fifo' ? 'bg-white' : 'bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow-lg ring-0 transition duration-200 ease-in-out ${
                  type === 'fifo' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Queue Name */}
          <div>
            <div className="flex justify-between items-center mb-1.5 text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
              <span>Queue Name</span>
              {type === 'fifo' && (
                <span className="text-zinc-300 font-mono lowercase text-[10px]">must end with .fifo</span>
              )}
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={type === 'fifo' ? 'e.g. orders.fifo' : 'e.g. standard-orders'}
              className="w-full bg-black/50 border border-white/10 text-white text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:border-white/30 transition placeholder:text-zinc-600 shadow-inner"
            />
          </div>

          {/* Visibility Timeout Slider */}
          <div>
            <div className="flex justify-between items-center mb-1.5 text-[11px] text-zinc-400">
              <span className="uppercase tracking-wider">Visibility Lease</span>
              <span className="text-white font-bold">{visibilityTimeout}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="60"
              value={visibilityTimeout}
              onChange={(e) => setVisibilityTimeout(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Max Receive Count Slider */}
          <div>
            <div className="flex justify-between items-center mb-1.5 text-[11px] text-zinc-400">
              <span className="uppercase tracking-wider">Max Retries (DLQ)</span>
              <span className="text-white font-bold">{maxReceiveCount} attempts</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={maxReceiveCount}
              onChange={(e) => setMaxReceiveCount(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Actions with Apple Pill Buttons */}
          <div className="flex justify-end gap-2.5 pt-5 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-zinc-300 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 rounded-full transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-1.5 text-xs font-semibold text-black bg-white/90 hover:bg-white active:scale-[0.98] rounded-full transition disabled:opacity-40 cursor-pointer shadow-lg shadow-white/5"
            >
              {isSubmitting ? 'Creating...' : 'Create Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
