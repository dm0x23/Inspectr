import React, { useState, useEffect } from 'react';
import { 
  Check, 
  Copy
} from 'lucide-react';
import type { Message } from '../types';

interface ReceivedMessageCardProps {
  message: Message;
  initialVisibilityTimeout: number;
  onAcknowledge: (messageId: string) => Promise<void>;
  onSimulateFailure: (messageId: string) => Promise<void>;
}

export const ReceivedMessageCard: React.FC<ReceivedMessageCardProps> = ({
  message,
  onAcknowledge,
  onSimulateFailure,
}) => {
  const [copied, setCopied] = useState(false);
  const [isAcking, setIsAcking] = useState(false);
  const [isFailing, setIsFailing] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    return Math.max(0, (message.visibilityExpiresAt || Date.now() + 30000) - Date.now());
  });

  useEffect(() => {
    const updateCountdown = () => {
      if (!message.visibilityExpiresAt) return;
      const left = Math.max(0, message.visibilityExpiresAt - Date.now());
      setRemainingMs(left);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);
    return () => clearInterval(interval);
  }, [message.visibilityExpiresAt]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAck = async () => {
    setIsAcking(true);
    try {
      await onAcknowledge(message.id);
    } finally {
      setIsAcking(false);
    }
  };

  const handleFail = async () => {
    setIsFailing(true);
    try {
      await onSimulateFailure(message.id);
    } finally {
      setIsFailing(false);
    }
  };

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const formattedCountdown = `00:${secondsLeft < 10 ? '0' : ''}${secondsLeft}s`;
  const isExpired = remainingMs <= 0;

  const poisonInfo = (() => {
    try {
      const data = JSON.parse(message.body);
      if (data && data.failProcessing === true) {
        return {
          isPoison: true,
          errorType: data.simulateError || 'PoisonPill',
        };
      }
    } catch {}
    return null;
  })();

  return (
    <div className={`bg-zinc-950 border ${poisonInfo ? 'border-red-900/60 shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-zinc-800 hover:border-zinc-700'} rounded-md p-7 sm:p-8 transition text-sm shadow-sm space-y-5`}>
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 font-mono text-sm flex-wrap">
          <span className="text-white font-semibold tracking-tight">{message.id}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400">attempt {message.receiveCount}</span>
          {message.messageGroupId && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">group:{message.messageGroupId}</span>
            </>
          )}
          {poisonInfo && (
            <span className="px-2 py-0.5 rounded border border-red-900/60 bg-red-950/40 text-red-400 text-xs font-mono font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span>CHAOS ({poisonInfo.errorType})</span>
            </span>
          )}
        </div>

        {/* Live Countdown Badge with Red/Emerald Accents */}
        <div
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded border font-mono text-xs shrink-0 ${
            isExpired
              ? 'border-zinc-800 bg-zinc-900 text-zinc-500'
              : secondsLeft <= 5
              ? 'border-red-900/60 bg-red-950/30 text-red-300'
              : 'border-emerald-900/40 bg-emerald-950/20 text-emerald-300'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isExpired
                ? 'bg-zinc-600'
                : secondsLeft <= 5
                ? 'bg-red-400 animate-pulse'
                : 'bg-emerald-400'
            }`}
          />
          <span>{isExpired ? 'lease expired' : `${formattedCountdown} left`}</span>
        </div>
      </div>

      {/* Code Block Payload with Non-Overlapping Header */}
      <div className="rounded border border-zinc-800 bg-black overflow-hidden my-4">
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 font-mono text-xs text-zinc-400">
          <span>Payload JSON</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-zinc-300 hover:text-white px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 transition cursor-pointer shrink-0"
            title="Copy payload"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
            <span className="text-[11px] font-medium">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-4 sm:p-5 font-mono text-sm text-zinc-200 overflow-x-auto max-h-52 leading-relaxed">
          {message.body}
        </pre>
      </div>

      {/* Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-900">
        <span className="text-zinc-500 font-mono text-xs shrink-0">
          {message.sizeKb} KB • {new Date(message.enqueueTime).toLocaleTimeString()}
        </span>

        <div className="flex items-center gap-3 shrink-0">
          {/* Action 1: Acknowledge (Emerald Accent) */}
          <button
            onClick={handleAck}
            disabled={isAcking}
            className="px-5 py-2.5 rounded border border-emerald-900/60 bg-emerald-950/20 hover:bg-emerald-950/60 text-emerald-400 hover:text-emerald-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
          >
            {isAcking ? 'Acknowledging...' : 'Acknowledge'}
          </button>

          {/* Action 2: Simulate Failure (Red Accent) */}
          <button
            onClick={handleFail}
            disabled={isFailing}
            className="px-5 py-2.5 rounded border border-red-900/60 bg-red-950/20 hover:bg-red-950/60 text-red-400 hover:text-red-300 text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
          >
            {isFailing ? 'Failing...' : 'Simulate Failure'}
          </button>
        </div>
      </div>
    </div>
  );
};
