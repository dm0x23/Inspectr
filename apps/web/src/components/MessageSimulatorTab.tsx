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
    if (!queue) return;
    setIsPurging(true);
    try {
      await onPurgeQueue();
      setReceivedMessages([]);
    } catch (err: unknown) {
      setPollError(err instanceof Error ? err.message : 'Failed to purge queue');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="flex flex-col gap-10 sm:gap-12 w-full mb-16">
      {/* ================= UPPER HALF: MESSENGER (PRODUCER CARD) ================= */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 rounded-2xl p-7 sm:p-9 lg:p-10 flex flex-col justify-between shadow-xl w-full">
        <div>
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between pb-5 border-b border-white/5 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-semibold text-white text-base sm:text-lg tracking-tight">Message Producer</h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-zinc-400">
                  {queue?.type || 'standard'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                Publish standard, FIFO, or chaos poison pill messages to <span className="text-zinc-200">{queue?.name || 'queue'}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handlePurge}
                disabled={isPurging || !queue}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 hover:border-red-500/30 bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-300 transition cursor-pointer text-xs font-mono disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Purge Queue</span>
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {producerError && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs flex items-center gap-2.5 font-mono shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{producerError}</span>
            </div>
          )}

          {producerSuccess && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs flex items-center gap-2.5 font-mono shadow-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{producerSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-6">
            {/* Presets Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-400 text-[11px] font-medium uppercase tracking-wider mr-1">Presets</span>
                {CHAOS_PRESETS.map((preset) => {
                  const isSelected = activePresetId === preset.id;
                  const isPoison = preset.id !== 'valid_order';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-all flex items-center gap-2 cursor-pointer border shrink-0 ${
                        isSelected
                          ? 'bg-white text-black border-white font-semibold shadow-sm'
                          : isPoison
                          ? 'bg-white/5 border-white/10 text-zinc-300 hover:text-red-300 hover:border-red-500/30'
                          : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:border-white/20'
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

              <span className="text-zinc-500 text-[11px] font-mono">
                {new TextEncoder().encode(producerPayload).length} bytes
              </span>
            </div>

            {/* Split Screen Columns: Left (JSON Payload) & Right (Parameters & Actions) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: JSON Payload Editor */}
              <div className="lg:col-span-8 space-y-1.5">
                <label className="text-zinc-400 text-[11px] font-mono uppercase tracking-wider block">
                  JSON Payload
                </label>
                <textarea
                  rows={8}
                  value={producerPayload}
                  onChange={(e) => {
                    setProducerPayload(e.target.value);
                    setActivePresetId('');
                  }}
                  className="w-full bg-black/50 border border-white/10 focus:border-white/30 rounded-xl p-4 text-xs font-mono text-zinc-100 focus:outline-none transition leading-relaxed resize-y shadow-inner"
                  placeholder='{ "key": "value" }'
                  spellCheck={false}
                />
              </div>

              {/* Right Column: Parameters (if FIFO) & Action Triggers */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-4 h-full">
                {queue?.type === 'fifo' ? (
                  <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-3 font-mono text-xs shadow-inner">
                    <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                      <span className="text-white font-semibold text-[11px] uppercase tracking-wider">
                        FIFO Parameters
                      </span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full border border-white/10 bg-white/5 text-zinc-300 font-mono">
                        Active
                      </span>
                    </div>

                    <div>
                      <label className="text-zinc-300 text-xs block mb-1">
                        Message Group ID <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={messageGroupId}
                        onChange={(e) => setMessageGroupId(e.target.value)}
                        placeholder="e.g. orders-stream"
                        required
                        className="w-full bg-black/50 border border-white/10 text-zinc-100 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-white/30 transition placeholder:text-zinc-600 shadow-inner"
                      />
                    </div>

                    <div>
                      <label className="text-zinc-300 text-xs block mb-1">
                        Deduplication ID <span className="text-zinc-500 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={dedupId}
                        onChange={(e) => setDedupId(e.target.value)}
                        placeholder="Auto SHA-256 if empty"
                        className="w-full bg-black/50 border border-white/10 text-zinc-100 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-white/30 transition placeholder:text-zinc-600 shadow-inner"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-white/10 bg-black/30 space-y-2 font-mono text-xs shadow-inner">
                    <span className="text-zinc-300 font-semibold block text-[11px] uppercase tracking-wider">Standard Queue</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                      Messages are delivered with maximum throughput. Order is best-effort with at-least-once delivery.
                    </p>
                  </div>
                )}

                {/* Send & Burst CTA Pills */}
                <div className="space-y-2.5 mt-auto pt-1">
                  <button
                    type="submit"
                    disabled={isSending || isBursting || !queue}
                    className="w-full py-2.5 px-5 rounded-full bg-white/90 hover:bg-white text-black text-xs font-semibold transition active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/5"
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" />
                    <span>{isSending ? 'Publishing...' : 'Publish Message'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSimulateBurst}
                    disabled={isBursting || isSending || !queue}
                    className="w-full py-2 px-4 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-mono font-medium transition active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer relative overflow-hidden"
                  >
                    {isBursting && (
                      <div className="absolute inset-0 bg-white/5 animate-pulse w-full h-full" />
                    )}
                    <Zap className={`w-3.5 h-3.5 shrink-0 ${isBursting ? 'animate-spin text-white' : 'text-amber-400'}`} />
                    <span>{isBursting ? 'Executing Burst (25 msgs)...' : 'Simulate Burst (25 msgs)'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ================= LOWER HALF: POLLING (CONSUMER MONITOR CARD) ================= */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.08] border-t-white/15 rounded-2xl p-7 sm:p-9 lg:p-10 flex flex-col justify-between shadow-xl w-full">
        <div>
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-5 border-b border-white/5 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-semibold text-white text-base sm:text-lg tracking-tight">Consumer Monitor &amp; Polling</h3>
                {receivedMessages.length > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-zinc-300">
                    {receivedMessages.length} active
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                Poll ready messages, test visibility lease countdowns, and simulate failure routing
              </p>
            </div>

            {receivedMessages.length > 0 && (
              <button
                type="button"
                onClick={() => setReceivedMessages([])}
                className="text-xs text-zinc-300 hover:text-white px-3 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition font-mono cursor-pointer shrink-0"
              >
                Clear All ({receivedMessages.length})
              </button>
            )}
          </div>

          {/* Polling Sliders & Trigger Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 p-5 rounded-2xl bg-black/35 border border-white/10 font-mono text-xs shadow-inner items-end">
            {/* Visibility Timeout Override */}
            <div>
              <div className="flex justify-between items-center mb-1.5 text-xs text-zinc-300">
                <span className="text-[11px] text-zinc-400">Lease Timeout</span>
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
              <div className="flex justify-between items-center mb-1.5 text-xs text-zinc-300">
                <span className="text-[11px] text-zinc-400">Batch Size</span>
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
              <div className="flex justify-between items-center mb-1.5 text-xs text-zinc-300">
                <span className="text-[11px] text-zinc-400">Wait Time</span>
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

            {/* Poll Button */}
            <div>
              <button
                type="button"
                onClick={handlePoll}
                disabled={isPolling || !queue}
                className="w-full py-2 px-5 rounded-full border border-white/15 hover:border-white/30 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isPolling ? 'animate-spin text-emerald-400' : ''}`} />
                <span>{isPolling ? 'Polling...' : `Poll Messages (${maxMessages})`}</span>
              </button>
            </div>
          </div>

          {/* Poll Info / Error Banner */}
          {pollError && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs flex items-center gap-2.5 font-mono shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{pollError}</span>
            </div>
          )}

          {/* Polled In-Flight Messages Display (Responsive Grid) */}
          <div>
            {receivedMessages.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-white/10 rounded-2xl bg-black/20">
                <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-3 shrink-0" />
                <p className="text-sm text-zinc-400 font-mono">No active in-flight messages leased</p>
                <p className="text-xs text-zinc-600 mt-1 font-mono">
                  Click &quot;Poll Messages&quot; above to pull messages from the ready queue
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {receivedMessages.map((msg) => (
                  <ReceivedMessageCard
                    key={msg.id}
                    message={msg}
                    initialVisibilityTimeout={visibilityOverride}
                    onAcknowledge={handleAcknowledge}
                    onSimulateFailure={handleSimulateFailure}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
