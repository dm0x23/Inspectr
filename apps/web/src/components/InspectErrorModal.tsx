import React, { useState } from 'react';
import { 
  X, 
  Terminal, 
  Copy, 
  Check, 
  RotateCcw, 
  Edit3 
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl rounded-md bg-zinc-950 border border-zinc-800 shadow-2xl p-8 sm:p-10 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-zinc-800">
          <div className="flex items-center gap-3.5 font-mono text-sm">
            <span className="font-bold text-white text-base">Exception Inspector</span>
            <span className="text-zinc-600">•</span>
            <span className="text-red-400 font-semibold">{message.id}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-zinc-400 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5 shrink-0" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-6 space-y-6 overflow-y-auto flex-1 pr-1.5 font-mono text-sm">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 p-6 rounded-md bg-zinc-900/50 border border-zinc-800">
            <div>
              <span className="text-xs text-zinc-500 uppercase block mb-1.5">Source Queue</span>
              <span className="text-white font-medium">{message.sourceQueue}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 uppercase block mb-1.5">Attempts</span>
              <span className="text-red-400 font-bold">{message.receiveCount}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 uppercase block mb-1.5">Failed At</span>
              <span className="text-zinc-300">{new Date(message.failedAt).toLocaleTimeString()}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 uppercase block mb-1.5">Payload Size</span>
              <span className="text-zinc-300">{message.sizeKb} KB</span>
            </div>
          </div>

          {/* Failure Reason (Red Accent) */}
          <div>
            <span className="text-xs text-red-400 uppercase tracking-wider block mb-2 font-semibold">Failure Reason</span>
            <div className="p-4 sm:p-5 rounded-md bg-red-950/20 border border-red-900/50 text-red-200 leading-relaxed">
              {message.failureReason}
            </div>
          </div>

          {/* Error Stack Trace */}
          <div>
            <div className="flex items-center justify-between mb-2 text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-2 uppercase tracking-wider font-semibold">
                <Terminal className="w-4 h-4 text-red-400 shrink-0" />
                <span>Simulated Stack Trace</span>
              </span>
              <button
                onClick={handleCopyTrace}
                className="text-zinc-400 hover:text-white transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                <span>{copied ? 'copied' : 'copy'}</span>
              </button>
            </div>

            <pre className="p-5 rounded-md bg-black border border-zinc-800 text-xs text-zinc-200 overflow-x-auto leading-relaxed max-h-56 whitespace-pre-wrap">
              {message.errorTrace}
              {'\n'}  at WorkerConsumer.processMessage (/var/task/worker.ts:84:15)
              {'\n'}  at VisibilityLease.onTimeout (/var/task/lease.ts:42:9)
              {'\n'}  at RedisQueue.moveToDLQ (/var/task/sqs-engine.ts:139:21)
              {'\n'}  Node: worker-node-primary-04 | Container: inspectr-core
            </pre>
          </div>

          {/* Message Payload Preview */}
          <div>
            <div className="flex items-center justify-between mb-2 text-xs text-zinc-400 font-mono">
              <span className="uppercase tracking-wider font-semibold">Failed Message Payload</span>
              <button
                onClick={() => {
                  onClose();
                  onOpenEditPayload(message);
                }}
                className="text-zinc-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5 shrink-0" />
                <span>edit in-place</span>
              </button>
            </div>
            <pre className="p-5 rounded-md bg-black border border-zinc-800 text-sm text-zinc-200 overflow-x-auto max-h-48 leading-relaxed">
              {message.body}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-zinc-800 font-sans text-sm">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-zinc-400 hover:text-white border border-zinc-800 hover:bg-zinc-900 rounded-md transition cursor-pointer"
          >
            Close
          </button>

          <div className="flex items-center gap-3.5">
            <button
              onClick={() => {
                onClose();
                onOpenEditPayload(message);
              }}
              className="px-5 py-2.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white transition cursor-pointer flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4 shrink-0" />
              <span>Edit Payload</span>
            </button>

            <button
              onClick={handleRedrive}
              disabled={isRedriving}
              className="px-6 py-2.5 rounded-md bg-white hover:bg-zinc-200 text-black font-semibold transition active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <RotateCcw className={`w-4 h-4 shrink-0 ${isRedriving ? 'animate-spin' : ''}`} />
              <span>{isRedriving ? 'Re-driving...' : 'Re-drive to Queue'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
