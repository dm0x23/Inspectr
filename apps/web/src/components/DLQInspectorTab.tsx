import React, { useState } from 'react';
import { 
  RotateCcw, 
  Search, 
  Edit3, 
  ShieldAlert, 
  Copy, 
  Check,
  ChevronDown,
  Terminal,
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
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

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

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleSingleRedriveClick = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRedrivingSingleId(id);
    try {
      await onRedriveSingle(id);
    } finally {
      setRedrivingSingleId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-8 w-full mb-16">
      {/* Top Glass DLQ Header Bar */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
        <div>
          <div className="flex items-center gap-3 mb-2 font-mono">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Dead-Letter Queue Inspector
            </h2>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-red-500/30 bg-red-500/15 text-red-300 font-bold font-mono shrink-0">
              {dlqMessages.length} quarantined
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono">
            Source: <span className="text-zinc-200">{sourceQueueName}</span> • DLQ: <span className="text-red-300">{dlqName}</span>
          </p>
        </div>

        {/* Primary Glass CTA: Bulk Re-Drive */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleBulkRedriveClick}
            disabled={isRedrivingBulk || dlqMessages.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-white/90 hover:bg-white text-black font-semibold text-xs transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-white/5 shrink-0"
          >
            <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${isRedrivingBulk ? 'animate-spin' : ''}`} />
            <span>{isRedrivingBulk ? 'Re-driving...' : 'Re-drive All to Queue'}</span>
            <span className="ml-1 px-2 py-0.2 rounded-full bg-black/15 text-[10px] font-mono font-bold shrink-0">
              {dlqMessages.length}
            </span>
          </button>
        </div>
      </div>

      {/* Table Toolbar & Inset Search Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
        <div className="relative w-full sm:max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search failed messages, traces, or payload..."
            className="w-full bg-black/40 border border-white/10 text-xs text-zinc-100 rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-white/30 transition placeholder:text-zinc-500 shadow-inner"
          />
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto justify-end text-zinc-400 shrink-0">
          <span className="text-[11px]">
            {filteredMessages.length} of {dlqMessages.length} message(s)
          </span>
          <button
            type="button"
            onClick={onRefreshDLQ}
            className="p-2 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer shadow-sm"
            title="Refresh DLQ"
          >
            <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Clean Translucent Table with Alternating Glass Hover Rows */}
      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden w-full shadow-2xl border-t-white/15">
        {filteredMessages.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-sm text-zinc-300 font-mono font-medium">Zero Dead-Lettered Messages</p>
            <p className="text-xs text-zinc-500 mt-1.5 font-mono">
              All messages in &quot;{sourceQueueName}&quot; are processing within retry thresholds.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/[0.02] border-b border-white/5 text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Message ID</th>
                  <th className="py-3.5 px-6">Original Queue</th>
                  <th className="py-3.5 px-6">Failure Reason</th>
                  <th className="py-3.5 px-6">Failed At</th>
                  <th className="py-3.5 px-6">Payload</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredMessages.map((msg) => {
                  const isExpanded = expandedRowId === msg.id;

                  return (
                    <React.Fragment key={msg.id}>
                      <tr
                        onClick={() => toggleExpand(msg.id)}
                        className={`hover:bg-white/[0.04] transition-colors cursor-pointer ${
                          isExpanded ? 'bg-white/[0.03]' : ''
                        }`}
                      >
                        {/* Message ID with Expand Chevron */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 shrink-0 ${
                                isExpanded ? 'rotate-180 text-white' : ''
                              }`}
                            />
                            <span className="text-white font-medium">{msg.id}</span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyId(msg.id, e)}
                              className="text-zinc-500 hover:text-white transition cursor-pointer shrink-0 p-0.5 rounded"
                              title="Copy ID"
                            >
                              {copiedId === msg.id ? (
                                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                              ) : (
                                <Copy className="w-3 h-3 shrink-0" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Original Queue */}
                        <td className="py-4 px-6 text-zinc-300">
                          {msg.sourceQueue}
                        </td>

                        {/* Failure Reason */}
                        <td className="py-4 px-6">
                          <span className="text-red-300 truncate max-w-[240px] block font-medium" title={msg.failureReason}>
                            {msg.failureReason}
                          </span>
                        </td>

                        {/* Failed Timestamp */}
                        <td className="py-4 px-6 text-zinc-400 whitespace-nowrap text-[11px]">
                          {new Date(msg.failedAt).toLocaleTimeString()}
                        </td>

                        {/* Payload Preview */}
                        <td className="py-4 px-6">
                          <span className="text-zinc-400 truncate max-w-[180px] block text-[11px]" title={msg.body}>
                            {msg.body.length > 28 ? `${msg.body.slice(0, 28)}...` : msg.body}
                          </span>
                        </td>

                        {/* Actions with Frosted Pills */}
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {/* Inspect Error Pill */}
                            <button
                              type="button"
                              onClick={() => onInspectError(msg)}
                              className="px-3 py-1 rounded-full border border-red-500/30 hover:border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-white transition text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <ShieldAlert className="w-3 h-3 text-red-400 shrink-0" />
                              <span>Inspect</span>
                            </button>

                            {/* Edit Payload Pill */}
                            <button
                              type="button"
                              onClick={() => onEditPayload(msg)}
                              className="px-3 py-1 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <Edit3 className="w-3 h-3 shrink-0" />
                              <span>Edit</span>
                            </button>

                            {/* Frosted Re-drive Action Pill */}
                            <button
                              type="button"
                              onClick={(e) => handleSingleRedriveClick(msg.id, e)}
                              disabled={redrivingSingleId === msg.id}
                              className="px-3.5 py-1 rounded-full border border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-white transition text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer font-medium shadow-sm"
                            >
                              <RotateCcw className={`w-3 h-3 shrink-0 ${redrivingSingleId === msg.id ? 'animate-spin' : ''}`} />
                              <span>Re-drive</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Drawer with Glowing Stack Trace */}
                      {isExpanded && (
                        <tr className="bg-black/60 border-t border-b border-white/10 animate-in fade-in duration-150">
                          <td colSpan={6} className="p-6">
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                                <Terminal className="w-3.5 h-3.5 text-red-400" />
                                <span>Failure Stack Trace & Metadata</span>
                              </div>

                              <div className="p-4 rounded-xl bg-black/80 border border-red-500/20 font-mono text-xs text-red-300 leading-relaxed overflow-x-auto shadow-inner">
                                <pre className="whitespace-pre-wrap font-mono">
                                  {msg.errorTrace || msg.failureReason}
                                </pre>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono pt-2">
                                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                                  <span className="text-zinc-500 text-[10px] uppercase font-semibold">Message ID</span>
                                  <div className="text-white font-medium">{msg.id}</div>
                                </div>
                                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                                  <span className="text-zinc-500 text-[10px] uppercase font-semibold">Total Delivery Attempts</span>
                                  <div className="text-white font-medium">{msg.receiveCount}</div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
