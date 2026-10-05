import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-md bg-zinc-950 border border-zinc-800 shadow-2xl p-8 sm:p-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-white">Create Queue</h3>
            <p className="text-xs text-zinc-400 mt-1 font-mono">Configure new simulated distributed queue</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-zinc-400 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5 shrink-0" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-6 p-4 rounded-md bg-red-950/30 border border-red-900/60 text-red-300 text-xs flex items-center gap-3 font-mono shadow-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-6 text-sm font-mono">
          {/* FIFO Queue Toggle */}
          <div className="flex items-center justify-between p-5 rounded-md border border-zinc-800 bg-zinc-900/40">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-white">FIFO Queue</span>
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded font-mono font-semibold ${
                    type === 'fifo'
                      ? 'bg-emerald-950/40 border border-emerald-900/60 text-emerald-400'
                      : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                  }`}
                >
                  {type === 'fifo' ? '.fifo enforced' : 'standard queue'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1.5 font-sans leading-relaxed">
                Strict FIFO delivery order per Message Group ID with 5-minute SHA-256 deduplication.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={type === 'fifo'}
              onClick={() => handleTypeChange(type === 'fifo' ? 'standard' : 'fifo')}
              className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                type === 'fifo' ? 'bg-white' : 'bg-zinc-800'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-black shadow-lg ring-0 transition duration-200 ease-in-out ${
                  type === 'fifo' ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Queue Name */}
          <div>
            <div className="flex justify-between items-center mb-2.5 text-xs text-zinc-400 font-semibold uppercase tracking-wider">
              <span>Queue Name</span>
              {type === 'fifo' && (
                <span className="text-emerald-400 font-mono lowercase text-[11px]">must end with .fifo</span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={type === 'fifo' ? 'e.g. orders.fifo' : 'e.g. standard-orders'}
                className="w-full bg-black border border-zinc-800 text-white text-sm rounded-md px-4 py-3 focus:outline-none focus:border-zinc-500 transition placeholder:text-zinc-700"
              />
            </div>
          </div>

          {/* Visibility Timeout Slider */}
          <div>
            <div className="flex justify-between items-center mb-2 text-xs text-zinc-400">
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
            <div className="flex justify-between items-center mb-2 text-xs text-zinc-400">
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-zinc-800 font-sans">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm text-zinc-400 hover:text-white border border-zinc-800 hover:bg-zinc-900 rounded-md transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-semibold text-black bg-white hover:bg-zinc-200 rounded-md transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isSubmitting ? 'Creating...' : 'Create Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
