import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Search,
  Check,
  MoreHorizontal,
  Copy,
  Flame,
  Trash2,
  Plus,
  X,
  Layers,
} from 'lucide-react';
import type { Queue } from '../types';

interface QueueSwitcherProps {
  queues: Queue[];
  selectedQueue: Queue | null;
  onSelectQueue: (queue: Queue) => void;
  onOpenCreateModal: () => void;
  onRequestPurgeQueue: (queue: Queue) => void;
  onRequestDeleteQueue: (queue: Queue) => void;
  onCopyArn: (queue: Queue) => void;
}

export const QueueSwitcher: React.FC<QueueSwitcherProps> = ({
  queues,
  selectedQueue,
  onSelectQueue,
  onOpenCreateModal,
  onRequestPurgeQueue,
  onRequestDeleteQueue,
  onCopyArn,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuQueue, setActiveMenuQueue] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const primaryQueues = queues.filter((q) => !q.name.endsWith('-dlq'));

  const filteredQueues = primaryQueues.filter((q) => {
    const qName = q.name.toLowerCase();
    const qType = q.type.toLowerCase();
    const query = searchQuery.trim().toLowerCase();
    return qName.includes(query) || qType.includes(query);
  });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
      setActiveMenuQueue(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveMenuQueue(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeMenuQueue) {
          setActiveMenuQueue(null);
        } else {
          setIsOpen(false);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeMenuQueue]);

  const activeTotal = selectedQueue
    ? selectedQueue.stats.readyCount + selectedQueue.stats.inFlightCount
    : 0;

  return (
    <div className="relative shrink-0" ref={popoverRef}>
      {/* Apple Frosted Glass Pill Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 hover:border-white/20 border-t-white/20 rounded-full px-3.5 py-1.5 transition-all cursor-pointer shadow-sm text-left group backdrop-blur-md"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {selectedQueue ? (
          <>
            {/* Queue Type Badge */}
            <span
              className={`text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-full border uppercase shrink-0 ${
                selectedQueue.type === 'fifo'
                  ? 'border-white/20 bg-white/10 text-white'
                  : 'border-white/10 bg-black/40 text-zinc-300'
              }`}
            >
              {selectedQueue.type === 'fifo' ? 'FIFO' : 'STD'}
            </span>

            {/* Active Queue Name */}
            <span className="font-mono text-xs font-semibold text-white tracking-tight truncate max-w-[140px] sm:max-w-[200px]">
              {selectedQueue.name}
            </span>

            {/* Total Pending Count Badge */}
            <span className="text-[10px] font-mono text-zinc-400 bg-black/40 border border-white/5 px-2 py-0.5 rounded-full shrink-0">
              {activeTotal} {activeTotal === 1 ? 'msg' : 'msgs'}
            </span>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>Select Queue...</span>
          </div>
        )}

        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {/* Floating Apple Vibrancy Command Popover */}
      {isOpen && (
        <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2.5 z-50 w-80 sm:w-96 rounded-2xl bg-zinc-900/90 backdrop-blur-3xl border border-white/15 border-t-white/25 shadow-2xl shadow-black/90 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 ring-1 ring-white/10">
          {/* Popover Inset Search Bar */}
          <div className="relative border-b border-white/10 p-3 bg-black/30 backdrop-blur-md">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search queues..."
              className="w-full bg-black/50 border border-white/10 focus:border-white/30 rounded-xl pl-9 pr-8 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 rounded-full cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Queue List Container */}
          <div className="max-h-72 overflow-y-auto divide-y divide-white/5 py-1.5 px-1.5">
            {filteredQueues.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-500 text-xs font-mono">
                {searchQuery ? (
                  <>
                    No queues matching <span className="text-zinc-300">"{searchQuery}"</span>
                  </>
                ) : (
                  'No queues found. Create your first queue below.'
                )}
              </div>
            ) : (
              filteredQueues.map((q) => {
                const isSelected = selectedQueue?.name === q.name;
                const isMenuOpen = activeMenuQueue === q.name;
                const totalMsgs = q.stats.readyCount + q.stats.inFlightCount;

                return (
                  <div
                    key={q.name}
                    className={`relative group px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'hover:bg-white/[0.06] text-zinc-300'
                    }`}
                    onClick={() => {
                      onSelectQueue(q);
                      setIsOpen(false);
                      setActiveMenuQueue(null);
                    }}
                  >
                    {/* Left: Queue Info */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>

                      <span
                        className={`text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-full border uppercase shrink-0 ${
                          q.type === 'fifo'
                            ? 'border-white/20 bg-white/10 text-white'
                            : 'border-white/10 bg-black/40 text-zinc-400'
                        }`}
                      >
                        {q.type === 'fifo' ? 'FIFO' : 'STD'}
                      </span>

                      <span className="font-mono text-xs font-medium truncate flex-1 group-hover:text-white">
                        {q.name}
                      </span>

                      <span className="text-[10px] font-mono text-zinc-400 bg-black/40 border border-white/5 px-2 py-0.5 rounded-full shrink-0">
                        {totalMsgs} msgs
                      </span>
                    </div>

                    {/* Right: Action Menu Trigger (...) */}
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuQueue(isMenuOpen ? null : q.name);
                        }}
                        className={`p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer ${
                          isMenuOpen ? 'bg-white/10 text-white' : 'opacity-70 group-hover:opacity-100'
                        }`}
                        title="Queue actions"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {/* Three-dots Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-8 z-60 w-48 rounded-xl bg-zinc-900/95 backdrop-blur-2xl border border-white/15 border-t-white/25 shadow-2xl py-1 text-xs font-mono divide-y divide-white/10 animate-in fade-in zoom-in-95 duration-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="py-1">
                            <button
                              type="button"
                              onClick={() => {
                                onCopyArn(q);
                                setActiveMenuQueue(null);
                              }}
                              className="w-full flex items-center gap-2 px-3.5 py-2 text-zinc-300 hover:text-white hover:bg-white/10 transition text-left cursor-pointer rounded-lg mx-auto"
                            >
                              <Copy className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Copy ARN / URL</span>
                            </button>
                          </div>

                          <div className="py-1">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuQueue(null);
                                setIsOpen(false);
                                onRequestPurgeQueue(q);
                              }}
                              className="w-full flex items-center gap-2 px-3.5 py-2 text-zinc-300 hover:text-white hover:bg-white/10 transition text-left cursor-pointer rounded-lg mx-auto"
                            >
                              <Flame className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Purge Messages</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuQueue(null);
                                setIsOpen(false);
                                onRequestDeleteQueue(q);
                              }}
                              className="w-full flex items-center gap-2 px-3.5 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition text-left cursor-pointer rounded-lg mx-auto"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              <span>Delete Queue</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom: + Create New Queue Button */}
          <div className="border-t border-white/10 p-2.5 bg-black/40 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenCreateModal();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-mono font-medium rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white transition cursor-pointer active:scale-[0.99]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Queue</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
