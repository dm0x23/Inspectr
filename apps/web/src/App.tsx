import { useState, useEffect, useCallback } from 'react';
import { 
  Send, 
  ShieldAlert,
  Activity,
} from 'lucide-react';
import type { Queue, DLQMessage, HealthStatus, CreateQueueData } from './types';
import { ApiClient } from './api/client';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { CreateQueueModal } from './components/CreateQueueModal';
import { MessageSimulatorTab } from './components/MessageSimulatorTab';
import { DLQInspectorTab } from './components/DLQInspectorTab';
import { CloudWatchTelemetryTab } from './components/CloudWatchTelemetryTab';
import { InspectErrorModal } from './components/InspectErrorModal';
import { EditPayloadModal } from './components/EditPayloadModal';

export function App() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [activeTab, setActiveTab] = useState<'simulator' | 'dlq' | 'telemetry'>('simulator');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // DLQ Messages State
  const [dlqMessages, setDlqMessages] = useState<DLQMessage[]>([]);
  const [isLoadingDLQ, setIsLoadingDLQ] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [inspectingMessage, setInspectingMessage] = useState<DLQMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DLQMessage | null>(null);

  // Toast / Status Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch Health
  const loadHealth = useCallback(async () => {
    try {
      const data = await ApiClient.getHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  }, []);

  // Fetch Queues
  const loadQueues = useCallback(async (selectQueueName?: string) => {
    try {
      const queueList = await ApiClient.listQueues();
      setQueues(queueList);

      setSelectedQueue((currentSelected) => {
        if (selectQueueName) {
          const match = queueList.find((q) => q.name === selectQueueName);
          if (match) return match;
        }
        if (currentSelected) {
          const updated = queueList.find((q) => q.name === currentSelected.name);
          if (updated) return updated;
        }
        const nonDlq = queueList.find((q) => !q.name.endsWith('-dlq'));
        return nonDlq || queueList[0] || null;
      });
    } catch (err: unknown) {
      console.error('Failed to load queues:', err);
    }
  }, []);

  // Fetch DLQ Messages
  const loadDLQMessages = useCallback(async (targetQueue?: Queue | null) => {
    const q = targetQueue || selectedQueue;
    if (!q) {
      setDlqMessages([]);
      return;
    }

    const dlqName = `${q.name}-dlq`;
    setIsLoadingDLQ(true);
    try {
      const msgs = await ApiClient.getDLQInspector(dlqName);
      setDlqMessages(msgs);
    } catch {
      setDlqMessages([]);
    } finally {
      setIsLoadingDLQ(false);
    }
  }, [selectedQueue]);

  // Initial Load & Auto-Refresh Interval
  useEffect(() => {
    loadHealth();
    loadQueues();

    const interval = setInterval(() => {
      loadHealth();
      loadQueues();
    }, 3000);

    return () => clearInterval(interval);
  }, [loadHealth, loadQueues]);

  // When selected queue changes, fetch its DLQ messages
  useEffect(() => {
    if (selectedQueue) {
      loadDLQMessages(selectedQueue);
    }
  }, [selectedQueue, loadDLQMessages]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadHealth(), loadQueues(), loadDLQMessages(selectedQueue)]);
    setIsRefreshing(false);
    showToast('Queue metrics refreshed', 'info');
  };

  // Create Queue Handler
  const handleCreateQueue = async (data: CreateQueueData) => {
    const result = await ApiClient.createQueue(data);
    await loadQueues(result.queue.name);
    showToast(`Queue "${result.queue.name}" created successfully!`, 'success');
  };

  // Send Message Handler
  const handleSendMessage = async (body: unknown, groupId?: string, dedupId?: string) => {
    if (!selectedQueue) throw new Error('No queue selected');
    const res = await ApiClient.sendMessage(selectedQueue.name, body, groupId, dedupId);
    await loadQueues(selectedQueue.name);
    if (res.deduplicated) {
      showToast(`FIFO Deduplication Window Active: Returning existing message ID ${res.message.id}`, 'info');
    } else {
      showToast(`Message ${res.message.id} published to ${selectedQueue.name}!`, 'success');
    }
  };

  // Poll Messages Handler
  const handlePollMessages = async (options: {
    maxMessages: number;
    visibilityTimeout: number;
    waitTimeSeconds: number;
  }) => {
    if (!selectedQueue) throw new Error('No queue selected');
    const msgs = await ApiClient.receiveMessages(selectedQueue.name, options);
    await loadQueues(selectedQueue.name);
    await loadDLQMessages(selectedQueue);
    return msgs;
  };

  // Acknowledge Message Handler
  const handleAcknowledgeMessage = async (messageId: string) => {
    if (!selectedQueue) return;
    await ApiClient.ackMessage(selectedQueue.name, messageId);
    await loadQueues(selectedQueue.name);
    showToast(`Message ${messageId} acknowledged and removed from storage.`, 'success');
  };

  // Simulate Failure Handler
  const handleSimulateFailure = async (messageId: string) => {
    if (!selectedQueue) return;
    const res = await ApiClient.simulateFailure(selectedQueue.name, messageId);
    await loadQueues(selectedQueue.name);
    await loadDLQMessages(selectedQueue);
    if (res.movedToDlq) {
      showToast(
        `Threshold exceeded (${selectedQueue.maxReceiveCount} attempts)! Message ${messageId} routed to DLQ.`,
        'error'
      );
    } else {
      showToast(
        `Failure simulated: Message retry count incremented to ${res.receiveCount}. Returned to ready queue.`,
        'info'
      );
    }
  };

  // Purge Queue Handler
  const handlePurgeQueue = async () => {
    if (!selectedQueue) return;
    const res = await ApiClient.purgeQueue(selectedQueue.name);
    await loadQueues(selectedQueue.name);
    showToast(`Queue "${selectedQueue.name}" purged (${res.totalPurged} messages removed).`, 'info');
  };

  // Traffic Burst Handler
  const handleBurstLoad = async (count = 25) => {
    if (!selectedQueue) throw new Error('No queue selected');
    const res = await ApiClient.sendBurst(selectedQueue.name, count);
    await Promise.all([loadQueues(selectedQueue.name), loadDLQMessages(selectedQueue)]);
    showToast(`Traffic burst: ${res.count} messages pipelined into "${selectedQueue.name}"`, 'success');
  };

  // DLQ: Bulk Redrive Handler
  const handleBulkRedrive = async () => {
    if (!selectedQueue) return;
    const dlqName = `${selectedQueue.name}-dlq`;
    const res = await ApiClient.redriveDLQ(dlqName);
    await loadQueues(selectedQueue.name);
    await loadDLQMessages(selectedQueue);
    showToast(
      `Re-drive complete! ${res.redrivenCount} message(s) returned to "${res.targetQueue}" with reset retry counts.`,
      'success'
    );
  };

  // DLQ: Single Message Redrive Handler
  const handleSingleRedrive = async (messageId: string) => {
    if (!selectedQueue) return;
    const dlqName = `${selectedQueue.name}-dlq`;
    const res = await ApiClient.redriveDLQ(dlqName, [messageId]);
    await loadQueues(selectedQueue.name);
    await loadDLQMessages(selectedQueue);
    showToast(`Message ${messageId} re-driven to "${res.targetQueue}"!`, 'success');
  };

  // DLQ: Save Edited Payload Handler
  const handleSaveEditedPayload = async (messageId: string, newBody: string) => {
    if (!selectedQueue) return;
    const dlqName = `${selectedQueue.name}-dlq`;
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(newBody);
    } catch {
      parsedBody = newBody;
    }
    await ApiClient.updateDLQMessage(dlqName, messageId, parsedBody);
    await loadDLQMessages(selectedQueue);
    showToast(`Message ${messageId} payload updated in DLQ.`, 'success');
  };

  const dlqCount = selectedQueue?.stats.dlqCount ?? dlqMessages.length;

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans antialiased selection:bg-zinc-800 selection:text-white w-full">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-md shadow-2xl text-xs font-mono ${
              toast.type === 'error'
                ? 'bg-red-950/60 border border-red-900/80 text-red-200'
                : toast.type === 'success'
                ? 'bg-zinc-900 border border-emerald-900/50 text-zinc-100'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-100'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                toast.type === 'success'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : toast.type === 'error'
                  ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'
                  : 'bg-zinc-400'
              }`}
            />
            <span className="font-sans text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <Header
        queues={queues}
        selectedQueue={selectedQueue}
        onSelectQueue={(q) => setSelectedQueue(q)}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        health={health}
      />

      {/* Main Container - Full Width across the entire page with generous horizontal & vertical spacing */}
      <main className="flex-1 w-full px-8 sm:px-16 lg:px-24 xl:px-32 2xl:px-40 py-14 lg:py-20 flex flex-col">
        {/* Metrics Row */}
        <MetricsCards
          queue={selectedQueue}
          onOpenDLQTab={() => setActiveTab('dlq')}
        />

        {/* Tab Navigation Controls */}
        <div className="flex items-center justify-between border-b border-zinc-800 mb-14 sm:mb-16 w-full gap-4">
          <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
            {/* Tab 1: Message Simulator */}
            <button
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center gap-3 py-4.5 px-5 text-sm font-semibold tracking-tight border-b-2 -mb-px transition cursor-pointer shrink-0 ${
                activeTab === 'simulator'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Send className="w-4 h-4 shrink-0" />
              <span>Message Simulator</span>
            </button>

            {/* Tab 2: DLQ Inspector & Replay */}
            <button
              onClick={() => setActiveTab('dlq')}
              className={`flex items-center gap-3 py-4.5 px-5 text-sm font-semibold tracking-tight border-b-2 -mb-px transition cursor-pointer shrink-0 ${
                activeTab === 'dlq'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ShieldAlert className={`w-4 h-4 shrink-0 ${dlqCount > 0 ? 'text-red-400' : ''}`} />
              <span>DLQ Inspector & Replay</span>
              {dlqCount > 0 && (
                <span className="ml-2.5 px-2.5 py-0.5 rounded border border-red-900/60 bg-red-950/40 text-red-400 text-xs font-mono font-bold shrink-0">
                  {dlqCount}
                </span>
              )}
            </button>

            {/* Tab 3: CloudWatch Telemetry */}
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center gap-3 py-4.5 px-5 text-sm font-semibold tracking-tight border-b-2 -mb-px transition cursor-pointer shrink-0 ${
                activeTab === 'telemetry'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Activity className="w-4 h-4 shrink-0" />
              <span>CloudWatch Telemetry</span>
            </button>
          </div>

          <div className="text-sm text-zinc-400 hidden sm:flex items-center gap-2.5 font-mono shrink-0">
            <span>target queue:</span>
            <span className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-white font-medium text-xs shadow-sm">
              {selectedQueue?.name || 'none'}
            </span>
          </div>
        </div>

        {/* Tab 1 Content: Message Simulator */}
        {activeTab === 'simulator' && (
          <MessageSimulatorTab
            queue={selectedQueue}
            onSendMessage={handleSendMessage}
            onPollMessages={handlePollMessages}
            onAcknowledgeMessage={handleAcknowledgeMessage}
            onSimulateFailure={handleSimulateFailure}
            onPurgeQueue={handlePurgeQueue}
            onBurstLoad={handleBurstLoad}
          />
        )}

        {/* Tab 2 Content: DLQ Inspector & Replay */}
        {activeTab === 'dlq' && (
          <DLQInspectorTab
            queue={selectedQueue}
            dlqMessages={dlqMessages}
            isLoading={isLoadingDLQ}
            onRefreshDLQ={() => loadDLQMessages(selectedQueue)}
            onInspectError={(msg) => setInspectingMessage(msg)}
            onEditPayload={(msg) => setEditingMessage(msg)}
            onRedriveBulk={handleBulkRedrive}
            onRedriveSingle={handleSingleRedrive}
          />
        )}

        {/* Tab 3 Content: CloudWatch Telemetry */}
        {activeTab === 'telemetry' && (
          <CloudWatchTelemetryTab
            queue={selectedQueue}
            onRefreshAll={() => {
              loadQueues(selectedQueue?.name);
              loadDLQMessages(selectedQueue);
            }}
          />
        )}
      </main>

      {/* Footer - Full Width with generous padding */}
      <footer className="border-t border-zinc-900 bg-black py-10 text-xs text-zinc-500 mt-auto w-full">
        <div className="w-full px-8 sm:px-16 lg:px-24 xl:px-32 2xl:px-40 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-zinc-300 text-sm">inspectr</span>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-400">SQS Distributed Queue Engine & Visual DLQ Console</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-500">
            <span>api: :3001</span>
            <span className="text-zinc-800">•</span>
            <span>redis: :6379</span>
          </div>
        </div>
      </footer>

      {/* Create Queue Modal */}
      <CreateQueueModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateQueue}
      />

      {/* Inspect Error Modal */}
      <InspectErrorModal
        isOpen={!!inspectingMessage}
        message={inspectingMessage}
        onClose={() => setInspectingMessage(null)}
        onOpenEditPayload={(msg) => setEditingMessage(msg)}
        onRedriveSingle={handleSingleRedrive}
      />

      {/* Edit Payload Modal */}
      <EditPayloadModal
        isOpen={!!editingMessage}
        message={editingMessage}
        onClose={() => setEditingMessage(null)}
        onSave={handleSaveEditedPayload}
      />
    </div>
  );
}

export default App;
