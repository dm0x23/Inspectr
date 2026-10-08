import React, { useState, useEffect } from 'react';
import { 
  Send, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2,
  Clock,
  Zap,
} from 'lucide-react';
import type { Queue, Message } from '../types';
import { ReceivedMessageCard } from './ReceivedMessageCard';

interface MessageSimulatorTabProps {
  queue: Queue | null;
  onSendMessage: (body: unknown, groupId?: string, dedupId?: string) => Promise<void>;
  onPollMessages: (options: { maxMessages: number; visibilityTimeout: number; waitTimeSeconds: number }) => Promise<Message[]>;
  onAcknowledgeMessage: (messageId: string) => Promise<void>;
  onSimulateFailure: (messageId: string) => Promise<void>;
  onPurgeQueue: () => Promise<void>;
  onBurstLoad: (count?: number) => Promise<void>;
}

const CHAOS_PRESETS = [
  {
    id: 'valid_order',
    name: 'Valid Order',
    data: { orderId: 'ord_9871', customerId: 'cust_402', totalAmount: 149.99, currency: 'USD', status: 'CONFIRMED' },
    groupId: 'orders-stream',
  },
  {
    id: 'poison_null',
    name: 'Poison Pill (Null Reference)',
    data: { orderId: null, simulateError: 'TypeError', failProcessing: true },
    groupId: 'orders-stream',
  },
  {
    id: 'corrupted_schema',
    name: 'Corrupted Schema',
    data: { invalidXml: '<<<malformed>>>', simulateError: 'SyntaxError', failProcessing: true },
    groupId: 'orders-stream',
  },
];

export const MessageSimulatorTab: React.FC<MessageSimulatorTabProps> = ({
  queue,
  onSendMessage,
  onPollMessages,
  onAcknowledgeMessage,
  onSimulateFailure,
  onPurgeQueue,
  onBurstLoad,
}) => {
  // Producer State
  const [activePresetId, setActivePresetId] = useState<string>('valid_order');
  const [producerPayload, setProducerPayload] = useState<string>(
    JSON.stringify(CHAOS_PRESETS[0].data, null, 2)
  );
  const [messageGroupId, setMessageGroupId] = useState<string>(
    queue?.type === 'fifo' ? 'orders-stream' : ''
  );
  const [dedupId, setDedupId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [isBursting, setIsBursting] = useState(false);
  const [producerError, setProducerError] = useState<string | null>(null);
  const [producerSuccess, setProducerSuccess] = useState<string | null>(null);

  // Consumer State
  const [visibilityOverride, setVisibilityOverride] = useState<number>(
    queue?.visibilityTimeout || 30
  );
  const [maxMessages, setMaxMessages] = useState<number>(1);
  const [waitTimeSeconds, setWaitTimeSeconds] = useState<number>(0);
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [receivedMessages, setReceivedMessages] = useState<Message[]>([]);
  const [isPurging, setIsPurging] = useState(false);

  useEffect(() => {
    if (queue?.type === 'fifo' && !messageGroupId.trim()) {
      setMessageGroupId('orders-stream');
    }
    if (queue?.visibilityTimeout) {
      setVisibilityOverride(queue.visibilityTimeout);
    }
  }, [queue?.name, queue?.type]);

  // Producer Handlers
  const handleSelectPreset = (preset: typeof CHAOS_PRESETS[0]) => {
    setActivePresetId(preset.id);
    setProducerPayload(JSON.stringify(preset.data, null, 2));
    if (queue?.type === 'fifo') {
      setMessageGroupId(preset.groupId);
    }
  };

  const handleSimulateBurst = async () => {
    if (!queue) return;
    setIsBursting(true);
    setProducerError(null);
    try {
      await onBurstLoad(25);
      setProducerSuccess('Traffic burst of 25 messages pipelined successfully');
      setTimeout(() => setProducerSuccess(null), 3000);
    } catch (err: unknown) {
      setProducerError(err instanceof Error ? err.message : 'Burst simulation failed');
    } finally {
      setIsBursting(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setProducerError(null);
    setProducerSuccess(null);

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(producerPayload);
    } catch {
      setProducerError('Payload must be valid JSON');
      return;
    }

    if (queue?.type === 'fifo' && !messageGroupId.trim()) {
      setProducerError('Message Group ID is mandatory for FIFO queues');
      return;
    }

    setIsSending(true);
    try {
      await onSendMessage(parsedBody, messageGroupId.trim(), dedupId.trim());
      setProducerSuccess('Message enqueued');
      setTimeout(() => setProducerSuccess(null), 3000);
    } catch (err: unknown) {
      setProducerError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Consumer Handlers
  const handlePoll = async () => {
    setPollError(null);
    setIsPolling(true);
    try {
      const messages = await onPollMessages({
        maxMessages,
        visibilityTimeout: visibilityOverride,
        waitTimeSeconds,
      });

      if (messages.length === 0) {
        setPollError('No messages available in ready queue.');
      } else {
        setReceivedMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newUnique = messages.filter((m) => !existingIds.has(m.id));
          return [...newUnique, ...prev];
        });

        // Feature 1: Consumer Simulator Poison Pill Auto-Fail Handling
        const poisonPills = messages.filter((m) => {
          try {
            const parsed = JSON.parse(m.body);
            return parsed && parsed.failProcessing === true;
          } catch {
            return false;
          }
        });

        if (poisonPills.length > 0) {
          for (const pill of poisonPills) {
            try {
              await onSimulateFailure(pill.id);
              // Remove failed message from polled list
              setReceivedMessages((prev) => prev.filter((m) => m.id !== pill.id));
            } catch (err: unknown) {
              console.error('Poison pill auto-fail error:', err);
            }
          }
        }
      }
    } catch (err: unknown) {
      setPollError(err instanceof Error ? err.message : 'Failed to poll messages');
    } finally {
      setIsPolling(false);
    }
  };

  const handleAcknowledge = async (messageId: string) => {
    await onAcknowledgeMessage(messageId);
    setReceivedMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const handleSimulateFailure = async (messageId: string) => {
    await onSimulateFailure(messageId);
    setReceivedMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const handlePurge = async () => {
    if (!window.confirm(`Purge all messages from queue "${queue?.name}"?`)) {
      return;
    }
    setIsPurging(true);
    try {
      await onPurgeQueue();
      setReceivedMessages([]);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 w-full mb-20">
      {/* ================= PRODUCER CARD ================= */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-md px-8 sm:px-10 lg:px-12 py-8 sm:py-10 lg:py-12 flex flex-col justify-between shadow-sm">
        <div>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between pb-5 border-b border-zinc-800 mb-8 gap-4">
            <div>
              <h3 className="font-bold text-white text-base">Producer</h3>
              <p className="text-xs text-zinc-400 mt-1 font-mono">Publish messages to {queue?.name || 'queue'}</p>
            </div>
          </div>

          {/* Feedback banners (Red for error, Emerald for success) */}
          {producerError && (
            <div className="mb-7 p-4 sm:p-5 rounded-md bg-red-950/30 border border-red-900/60 text-red-300 text-xs flex items-center gap-3 font-mono shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{producerError}</span>
            </div>
          )}

          {producerSuccess && (
            <div className="mb-7 p-4 sm:p-5 rounded-md bg-emerald-950/30 border border-emerald-900/60 text-emerald-300 text-xs flex items-center gap-3 font-mono shadow-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{producerSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-7">
            {/* Feature 1: Preset selector with 3 pill buttons above the JSON payload editor */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono text-xs">
                <span className="text-zinc-400 font-medium">Presets</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {CHAOS_PRESETS.map((preset) => {
                    const isSelected = activePresetId === preset.id;
                    const isPoison = preset.id !== 'valid_order';
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`px-3 py-1.5 rounded-full text-xs font-mono transition flex items-center gap-1.5 cursor-pointer border shrink-0 ${
                          isSelected
                            ? 'bg-white text-black border-white font-semibold shadow-sm'
                            : isPoison
                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-red-300 hover:border-red-900/60'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            !isPoison
                              ? isSelected ? 'bg-emerald-600' : 'bg-emerald-400'
                              : isSelected ? 'bg-red-600' : 'bg-red-400'
                          }`}
                        />
                        <span>{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* JSON Payload input */}
              <div>
                <div className="flex justify-between items-center mb-2.5 font-mono text-xs">
                  <label className="text-zinc-300 font-medium uppercase tracking-wider">Payload (JSON)</label>
                  <span className="text-zinc-500">
                    {new TextEncoder().encode(producerPayload).length} bytes
                  </span>
                </div>
                <textarea
                  rows={11}
                  value={producerPayload}
                  onChange={(e) => {
                    setProducerPayload(e.target.value);
                    setActivePresetId('');
                  }}
                  className="w-full bg-black border border-zinc-800 rounded-md p-5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 transition leading-relaxed resize-y"
                  placeholder='{ "key": "value" }'
                  spellCheck={false}
                />
              </div>
            </div>

            {/* FIFO Controls */}
            {queue?.type === 'fifo' && (
              <div className="p-6 rounded-md border border-zinc-800 bg-zinc-900/40 space-y-4 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <div className="text-white font-semibold text-xs uppercase tracking-wider">
                    FIFO Ordering Parameters
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded border border-emerald-900/60 bg-emerald-950/40 text-emerald-400 font-mono font-medium">
                    FIFO Active
                  </span>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-zinc-300">
                      Message Group ID <span className="text-red-400 font-bold">*</span>
                    </label>
                    <span className="text-[11px] text-zinc-500">required for ordering</span>
                  </div>
                  <input
                    type="text"
                    value={messageGroupId}
                    onChange={(e) => setMessageGroupId(e.target.value)}
                    placeholder="e.g. orders-stream"
                    required
                    className="w-full bg-black border border-zinc-800 text-zinc-100 text-sm rounded px-4 py-2.5 focus:outline-none focus:border-zinc-500 transition placeholder:text-zinc-700"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-zinc-300">
                      Deduplication ID <span className="text-zinc-500 font-normal">(optional)</span>
                    </label>
                    <span className="text-[11px] text-zinc-500">SHA-256 hash if empty</span>
                  </div>
                  <input
                    type="text"
                    value={dedupId}
                    onChange={(e) => setDedupId(e.target.value)}
                    placeholder="SHA-256 auto-generated from payload if empty"
                    className="w-full bg-black border border-zinc-800 text-zinc-100 text-sm rounded px-4 py-2.5 focus:outline-none focus:border-zinc-500 transition placeholder:text-zinc-700"
                  />
                </div>
              </div>
            )}

            {/* High-Contrast "Publish Message" CTA + Feature 2: Simulate Burst (25 msgs) */}
            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSending || isBursting || !queue}
                className="w-full py-4 px-6 rounded-md bg-white hover:bg-zinc-200 text-black text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>{isSending ? 'Publishing...' : 'Publish Message'}</span>
              </button>

              {/* Feature 2: Simulate Burst Secondary Action */}
              <button
                type="button"
                onClick={handleSimulateBurst}
                disabled={isBursting || isSending || !queue}
                className="w-full py-3 px-5 rounded-md border border-zinc-700 hover:border-zinc-500 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white text-xs font-mono font-medium transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm relative overflow-hidden"
              >
                {isBursting && (
                  <div className="absolute inset-0 bg-white/5 animate-pulse w-full h-full" />
                )}
                <Zap className={`w-3.5 h-3.5 shrink-0 ${isBursting ? 'animate-spin text-white' : 'text-zinc-400'}`} />
                <span>{isBursting ? 'Executing Burst (25 msgs)...' : 'Simulate Burst (25 msgs)'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer Purge Action */}
        <div className="pt-7 mt-12 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-400 font-mono">
          <span>Target: <span className="text-white font-medium">{queue?.name}</span></span>
          <button
            onClick={handlePurge}
            disabled={isPurging || !queue}
            className="flex items-center gap-2 text-zinc-400 hover:text-red-400 transition cursor-pointer shrink-0"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Purge Queue</span>
          </button>
        </div>
      </div>

      {/* ================= CONSUMER CARD ================= */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-md px-8 sm:px-10 lg:px-12 py-8 sm:py-10 lg:py-12 flex flex-col justify-between shadow-sm">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-5 border-b border-zinc-800 mb-8 gap-4">
            <div>
              <h3 className="font-bold text-white text-base">Consumer Monitor</h3>
              <p className="text-xs text-zinc-400 mt-1 font-mono">Poll active messages and inspect leases</p>
            </div>

            {receivedMessages.length > 0 && (
              <button
                onClick={() => setReceivedMessages([])}
                className="text-xs text-zinc-300 hover:text-white px-3.5 py-1.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition font-mono cursor-pointer shrink-0"
              >
                Clear ({receivedMessages.length})
              </button>
            )}
          </div>

          {/* Minimal Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8 p-6 sm:p-7 rounded-md bg-zinc-900/40 border border-zinc-800 font-mono text-xs">
            {/* Visibility Timeout Override */}
            <div>
              <div className="flex justify-between items-center mb-2 text-xs text-zinc-300">
                <span>Lease Timeout</span>
                <span className="text-white font-bold">{visibilityOverride}s</span>
              </div>
              <input
                type="range"
                min="1"
                max="60"
                value={visibilityOverride}
                onChange={(e) => setVisibilityOverride(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Batch Size */}
            <div>
              <div className="flex justify-between items-center mb-2 text-xs text-zinc-300">
                <span>Batch Size</span>
                <span className="text-white font-bold">{maxMessages}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={maxMessages}
                onChange={(e) => setMaxMessages(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Wait Time (Long Polling) */}
            <div>
              <div className="flex justify-between items-center mb-2 text-xs text-zinc-300">
                <span>Wait Time</span>
                <span className="text-white font-bold">{waitTimeSeconds}s</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={waitTimeSeconds}
                onChange={(e) => setWaitTimeSeconds(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Poll Button */}
          <button
            onClick={handlePoll}
            disabled={isPolling || !queue}
            className="w-full py-4 px-6 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2.5 mb-8 cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${isPolling ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{isPolling ? 'Polling...' : `Poll Messages (${maxMessages})`}</span>
          </button>

          {/* Poll Info / Error */}
          {pollError && (
            <div className="mb-8 p-4 sm:p-5 rounded-md bg-red-950/30 border border-red-900/60 text-red-300 text-xs flex items-center gap-3 font-mono shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{pollError}</span>
            </div>
          )}

          {/* Polled Messages List */}
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-1">
            {receivedMessages.length === 0 ? (
              <div className="py-28 text-center border border-dashed border-zinc-800 rounded-md">
                <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-3 shrink-0" />
                <p className="text-sm text-zinc-400 font-mono">No active in-flight messages polled</p>
                <p className="text-xs text-zinc-600 mt-1.5 font-mono">Click &quot;Poll Messages&quot; to receive ready messages</p>
              </div>
            ) : (
              receivedMessages.map((msg) => (
                <ReceivedMessageCard
                  key={msg.id}
                  message={msg}
                  initialVisibilityTimeout={visibilityOverride}
                  onAcknowledge={handleAcknowledge}
                  onSimulateFailure={handleSimulateFailure}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
