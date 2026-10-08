import React, { useState } from 'react';
import { 
  X, 
  Terminal, 
  Copy, 
  Check, 
  RotateCcw, 
  Edit3,
  Loader2,
} from 'lucide-react';
import type { DLQMessage } from '../types';

interface InspectErrorModalProps {
  isOpen: boolean;
  message: DLQMessage | null;
  onClose: () => void;
  onOpenEditPayload: (msg: DLQMessage) => void;
  onRedriveSingle: (messageId: string) => Promise<void>;
}

export const InspectErrorModal: React.FC<InspectErrorModalProps> = ({
  isOpen,
  message,
  onClose,
  onOpenEditPayload,
  onRedriveSingle,
}) => {
  const [copied, setCopied] = useState(false);
  const [isRedriving, setIsRedriving] = useState(false);

  if (!isOpen || !message) return null;

  const handleCopyTrace = () => {
    navigator.clipboard.writeText(`${message.failureReason}\n\n${message.errorTrace}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRedrive = async () => {
    setIsRedriving(true);
    try {
      await onRedriveSingle(message.id);
      onClose();
    } finally {
      setIsRedriving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl rounded-2xl bg-zinc-900/90 backdrop-blur-3xl border border-white/15 border-t-white/25 shadow-2xl p-7 sm:p-9 overflow-hidden flex flex-col max-h-[92vh] ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="font-bold text-white text-sm">Exception Inspector</span>
            <span className="text-zinc-600">•</span>
            <span className="text-red-300 font-semibold">{message.id}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-5 space-y-5 overflow-y-auto flex-1 pr-1.5 font-mono text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-black/40 border border-white/10 shadow-inner">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block mb-1">Source Queue</span>
              <span className="text-white font-medium">{message.sourceQueue}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block mb-1">Attempts</span>
              <span className="text-red-300 font-bold">{message.receiveCount}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block mb-1">Failed At</span>
              <span className="text-zinc-300">{new Date(message.failedAt).toLocaleTimeString()}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block mb-1">Payload Size</span>
              <span className="text-zinc-300">{message.sizeKb} KB</span>
            </div>
          </div>

          {/* Failure Reason */}
          <div>
            <span className="text-[10px] text-red-400 uppercase tracking-wider block mb-1.5 font-semibold">Failure Reason</span>
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 leading-relaxed font-mono">
              {message.failureReason}
            </div>
          </div>

          {/* Error Stack Trace with Glow */}
          <div>
            <div className="flex items-center justify-between mb-1.5 text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold">
                <Terminal className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>Runtime Stack Trace</span>
              </span>
              <button
                type="button"
                onClick={handleCopyTrace}
                className="flex items-center gap-1.5 text-zinc-300 hover:text-white px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer text-[11px]"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
                <span>{copied ? 'Copied' : 'Copy Trace'}</span>
              </button>
            </div>
            <pre className="p-4 sm:p-5 rounded-xl bg-black/60 border border-white/10 text-red-300 overflow-x-auto text-xs leading-relaxed max-h-56 shadow-inner whitespace-pre-wrap">
              {message.errorTrace || message.failureReason}
            </pre>
          </div>

          {/* Payload Preview */}
          <div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1.5 font-semibold">Quarantined Payload</span>
            <pre className="p-4 rounded-xl bg-black/50 border border-white/10 text-zinc-200 overflow-x-auto text-xs max-h-40 shadow-inner">
              {message.body}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenEditPayload(message);
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-200 hover:text-white transition text-xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Payload</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleRedrive}
              disabled={isRedriving}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-semibold transition active:scale-[0.98] disabled:opacity-40 cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              {isRedriving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>{isRedriving ? 'Re-driving...' : 'Re-drive Message'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
