import React, { useState } from 'react';
import { 
  RotateCcw, 
  Search, 
  Edit3, 
  ShieldAlert, 
  Copy, 
  Check 
} from 'lucide-react';
import type { DLQMessage, Queue } from '../types';

interface DLQInspectorTabProps {
  queue: Queue | null;
  dlqMessages: DLQMessage[];
  isLoading: boolean;
  onRefreshDLQ: () => void;
  onInspectError: (msg: DLQMessage) => void;
  onEditPayload: (msg: DLQMessage) => void;
  onRedriveBulk: () => Promise<void>;
  onRedriveSingle: (messageId: string) => Promise<void>;
}

export const DLQInspectorTab: React.FC<DLQInspectorTabProps> = ({
  queue,
  dlqMessages,
  isLoading,
  onRefreshDLQ,
  onInspectError,
  onEditPayload,
  onRedriveBulk,
  onRedriveSingle,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRedrivingBulk, setIsRedrivingBulk] = useState(false);
  const [redrivingSingleId, setRedrivingSingleId] = useState<string | null>(null);

  const dlqName = queue ? `${queue.name}-dlq` : 'dlq';
  const sourceQueueName = queue ? queue.name : 'source';

  const filteredMessages = dlqMessages.filter((msg) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      msg.id.toLowerCase().includes(q) ||
      msg.failureReason.toLowerCase().includes(q) ||
      msg.body.toLowerCase().includes(q) ||
      msg.sourceQueue.toLowerCase().includes(q)
    );
  });

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBulkRedriveClick = async () => {
    if (!window.confirm(`Re-drive ALL ${dlqMessages.length} message(s) from "${dlqName}" back to "${sourceQueueName}"?`)) {
      return;
    }
    setIsRedrivingBulk(true);
    try {
      await onRedriveBulk();
    } finally {
      setIsRedrivingBulk(false);
    }
  };

  const handleSingleRedriveClick = async (id: string) => {
    setRedrivingSingleId(id);
    try {
      await onRedriveSingle(id);
    } finally {
      setRedrivingSingleId(null);
    }
  };

  return (
    <div className="space-y-12 sm:space-y-14 w-full mb-20">
      {/* Top DLQ Header Bar */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-md px-8 sm:px-10 lg:px-12 py-8 sm:py-10 lg:py-12 flex flex-col md:flex-row md:items-center justify-between gap-8 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-2.5 font-mono">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Dead-Letter Queue Inspector & Replay
            </h2>
            <span className="text-xs px-2.5 py-1 rounded border border-red-900/60 bg-red-950/40 text-red-400 font-bold font-mono shrink-0">
              {dlqMessages.length} failed
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 font-mono">
            Source: <span className="text-white font-medium">{sourceQueueName}</span> • DLQ: <span className="text-red-400 font-medium">{dlqName}</span>
          </p>
        </div>

        {/* Primary High-Contrast One-Click Bulk Re-Drive CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleBulkRedriveClick}
            disabled={isRedrivingBulk || dlqMessages.length === 0}
            className="flex items-center gap-3 px-6 py-3 rounded-md bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm shrink-0"
          >
            <RotateCcw className={`w-4 h-4 shrink-0 ${isRedrivingBulk ? 'animate-spin' : ''}`} />
            <span>{isRedrivingBulk ? 'Re-driving...' : 'Re-drive All to Queue'}</span>
            <span className="ml-1.5 px-2.5 py-0.5 rounded bg-black/15 text-xs font-mono font-bold shrink-0">
              {dlqMessages.length}
            </span>
          </button>
        </div>
      </div>

      {/* Table Toolbar & Search Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-sm font-mono">
        <div className="relative w-full sm:max-w-lg">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by message ID, error trace, or payload..."
            className="w-full bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 rounded-md pl-11 pr-5 py-3 focus:outline-none focus:border-zinc-500 transition placeholder:text-zinc-600 shadow-sm"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        </div>

        <div className="flex items-center gap-5 w-full sm:w-auto justify-end text-zinc-400 shrink-0">
          <span>
            {filteredMessages.length} of {dlqMessages.length} message(s)
          </span>
          <button
            onClick={onRefreshDLQ}
            className="p-3 rounded-md border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white transition cursor-pointer shrink-0"
            title="Refresh DLQ"
          >
            <RotateCcw className={`w-4 h-4 shrink-0 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Minimalist DLQ Table with Slight Roundness */}
      <div className="rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden w-full shadow-sm">
        {filteredMessages.length === 0 ? (
          <div className="py-28 text-center">
            <p className="text-base text-zinc-300 font-mono font-medium">Zero Dead-Lettered Messages</p>
            <p className="text-xs text-zinc-500 mt-2 font-mono">
              All messages in &quot;{sourceQueueName}&quot; are processing within retry thresholds.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm font-mono">
              <thead className="bg-zinc-900/60 border-b border-zinc-800 text-xs uppercase font-semibold text-zinc-400 tracking-wider">
                <tr>
                  <th className="py-4.5 px-8 sm:px-10">Message ID</th>
                  <th className="py-4.5 px-8 sm:px-10">Original Queue</th>
                  <th className="py-4.5 px-8 sm:px-10">Failure Reason</th>
                  <th className="py-4.5 px-8 sm:px-10">Failed At</th>
                  <th className="py-4.5 px-8 sm:px-10">Payload Preview</th>
                  <th className="py-4.5 px-8 sm:px-10 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredMessages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-zinc-900/40 transition">
                    {/* Message ID */}
                    <td className="py-5 px-8 sm:px-10">
                      <div className="flex items-center gap-2.5">
                        <span className="text-white font-medium">{msg.id}</span>
                        <button
                          onClick={() => handleCopyId(msg.id)}
                          className="text-zinc-500 hover:text-white transition cursor-pointer shrink-0"
                          title="Copy ID"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Original Queue */}
                    <td className="py-5 px-8 sm:px-10 text-zinc-300">
                      {msg.sourceQueue}
                    </td>

                    {/* Failure Reason */}
                    <td className="py-5 px-8 sm:px-10">
                      <span className="text-red-300/90 truncate max-w-[280px] block font-medium" title={msg.failureReason}>
                        {msg.failureReason}
                      </span>
                    </td>

                    {/* Failed Timestamp */}
                    <td className="py-5 px-8 sm:px-10 text-zinc-400 whitespace-nowrap text-xs">
                      {new Date(msg.failedAt).toLocaleTimeString()}
                    </td>

                    {/* Payload Preview */}
                    <td className="py-5 px-8 sm:px-10">
                      <span className="text-zinc-400 truncate max-w-[220px] block font-mono text-xs" title={msg.body}>
                        {msg.body.length > 32 ? `${msg.body.slice(0, 32)}...` : msg.body}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-5 px-8 sm:px-10 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-3 shrink-0">
                        {/* 1. Inspect Error (Red Accent) */}
                        <button
                          onClick={() => onInspectError(msg)}
                          className="px-3.5 py-2 rounded border border-red-900/60 hover:border-red-800 bg-red-950/20 hover:bg-red-950/60 text-red-300 hover:text-red-200 transition text-xs flex items-center gap-2 cursor-pointer shrink-0"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>Inspect</span>
                        </button>

                        {/* 2. Edit Payload */}
                        <button
                          onClick={() => onEditPayload(msg)}
                          className="px-3.5 py-2 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white transition text-xs flex items-center gap-2 cursor-pointer shrink-0"
                        >
                          <Edit3 className="w-3.5 h-3.5 shrink-0" />
                          <span>Edit</span>
                        </button>

                        {/* 3. Re-drive single (Emerald Accent) */}
                        <button
                          onClick={() => handleSingleRedriveClick(msg.id)}
                          disabled={redrivingSingleId === msg.id}
                          className="px-4 py-2 rounded border border-emerald-900/60 hover:border-emerald-800 bg-emerald-950/20 hover:bg-emerald-950/60 text-emerald-400 hover:text-emerald-300 transition text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer font-semibold shadow-sm shrink-0"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${redrivingSingleId === msg.id ? 'animate-spin' : ''}`} />
                          <span>Re-drive</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
