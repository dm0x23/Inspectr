import React, { useState, useEffect } from 'react';
import { 
  Check, 
  Copy,
  Loader2,
  XCircle,
  CheckCircle2,
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
  initialVisibilityTimeout,
  onAcknowledge,
  onSimulateFailure,
}) => {
  const [copied, setCopied] = useState(false);
  const [isAcking, setIsAcking] = useState(false);
  const [isFailing, setIsFailing] = useState(false);

  const totalDurationMs = Math.max(1000, (initialVisibilityTimeout || 30) * 1000);
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    return Math.max(0, (message.visibilityExpiresAt || Date.now() + totalDurationMs) - Date.now());
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

  // Circular progress calculations (radius = 9)
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = Math.max(0, Math.min(1, remainingMs / totalDurationMs));
  const strokeDashoffset = circumference * (1 - progressRatio);

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
    <div className={`bg-white/[0.03] backdrop-blur-md border ${
      poisonInfo ? 'border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.08)]' : 'border-white/[0.08] hover:border-white/15'
    } border-t-white/15 rounded-2xl p-6 sm:p-7 transition-all text-sm shadow-xl space-y-4`}>
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 font-mono text-xs flex-wrap">
          <span className="text-white font-semibold tracking-tight">{message.id}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400">attempt {message.receiveCount}</span>
          {message.messageGroupId && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">grp:{message.messageGroupId}</span>
            </>
          )}
          {poisonInfo && (
            <span className="px-2.5 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-300 text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span>CHAOS ({poisonInfo.errorType})</span>
            </span>
          )}
        </div>

        {/* Circular Radial Progress Ring & Glowing Pill Tag */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full border font-mono text-xs shrink-0 transition-all ${
            isExpired
              ? 'border-white/10 bg-black/40 text-zinc-500'
              : secondsLeft <= 5
              ? 'border-red-500/40 bg-red-500/10 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
          }`}
        >
          {/* Radial progress ring SVG */}
          <div className="relative w-4.5 h-4.5 flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 -rotate-90" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r={radius}
                className="stroke-white/10"
                strokeWidth="2.5"
                fill="none"
              />
              <circle
                cx="12"
                cy="12"
                r={radius}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
                className="transition-all duration-100 ease-linear"
              />
            </svg>
          </div>

          <span className="text-[11px] font-medium tracking-tight">
            {isExpired ? 'lease expired' : `${formattedCountdown} left`}
          </span>
        </div>
      </div>

      {/* Inset Glass Code Block Payload */}
      <div className="rounded-xl border border-white/10 bg-black/50 overflow-hidden shadow-inner my-3">
        <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.02] border-b border-white/5 font-mono text-xs text-zinc-400">
          <span className="text-[11px]">Payload</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-zinc-300 hover:text-white px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer shrink-0"
            title="Copy payload"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span className="text-[10px] font-medium">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-4 font-mono text-xs text-zinc-200 overflow-x-auto max-h-48 leading-relaxed">
          {message.body}
        </pre>
      </div>

      {/* Actions Row with Apple Glass Pills */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/5">
        <span className="text-zinc-500 font-mono text-[11px] shrink-0">
          {message.sizeKb} KB • {new Date(message.enqueueTime).toLocaleTimeString()}
        </span>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Action 1: Acknowledge (Emerald Pill) */}
          <button
            type="button"
            onClick={handleAck}
            disabled={isAcking}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-white text-xs font-medium transition disabled:opacity-40 cursor-pointer shadow-sm active:scale-[0.98]"
          >
            {isAcking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>{isAcking ? 'Acknowledging...' : 'Acknowledge'}</span>
          </button>

          {/* Action 2: Simulate Failure (Red Pill) */}
          <button
            type="button"
            onClick={handleFail}
            disabled={isFailing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-red-500/30 hover:border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-white text-xs font-medium transition disabled:opacity-40 cursor-pointer shadow-sm active:scale-[0.98]"
          >
            {isFailing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            <span>{isFailing ? 'Failing...' : 'Simulate Failure'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
