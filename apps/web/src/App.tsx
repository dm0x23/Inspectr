import { useState, useEffect, useCallback } from 'react';
import { 
  Layers,
  Plus,
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
import { PurgeQueueModal } from './components/PurgeQueueModal';
import { DeleteQueueModal } from './components/DeleteQueueModal';

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
  const [queueToPurge, setQueueToPurge] = useState<Queue | null>(null);
  const [queueToDelete, setQueueToDelete] = useState<Queue | null>(null);

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

  // Confirm Purge Queue Handler
  const handleConfirmPurge = async (queueName: string) => {
    const res = await ApiClient.purgeQueue(queueName);
    await loadQueues(selectedQueue?.name);
    if (selectedQueue?.name === queueName) {
      await loadDLQMessages(selectedQueue);
    }
    showToast(`Queue "${queueName}" purged (${res.totalPurged} messages removed).`, 'info');
  };

  // Confirm Delete Queue Handler
  const handleConfirmDelete = async (queueName: string) => {
    await ApiClient.deleteQueue(queueName);
    showToast(`Queue "${queueName}" and its resources deleted.`, 'info');

    // Auto-switch to next available queue if the active queue was deleted
    const remaining = queues.filter((q) => q.name !== queueName && q.name !== `${queueName}-dlq`);
    const nextQueue = remaining.find((q) => !q.name.endsWith('-dlq')) || remaining[0] || null;

    if (selectedQueue?.name === queueName) {
      setSelectedQueue(nextQueue);
    }
    await loadQueues(nextQueue?.name);
  };

  // Copy Queue ARN Handler
  const handleCopyArn = (q: Queue) => {
    const arn = `arn:aws:sqs:us-east-1:123456789012:${q.name}`;
    navigator.clipboard.writeText(arn);
    showToast(`Copied ARN to clipboard: ${arn}`, 'info');
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
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-white/20 selection:text-white relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div
            className={`flex items-center gap-3 px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-2xl text-xs font-mono border ${
              toast.type === 'error'
                ? 'bg-red-950/70 border-red-500/30 text-red-200'
                : toast.type === 'success'
                ? 'bg-zinc-900/80 border-emerald-500/30 text-emerald-200'
                : 'bg-zinc-900/80 border-white/10 text-zinc-200'
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
            <span className="font-sans text-xs font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Edge-to-Edge Navigation Header */}
      <Header
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        dlqCount={dlqCount}
        queues={queues}
        selectedQueue={selectedQueue}
        onSelectQueue={(q) => setSelectedQueue(q)}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        health={health}
        onRequestPurgeQueue={(q) => setQueueToPurge(q)}
        onRequestDeleteQueue={(q) => setQueueToDelete(q)}
        onCopyArn={handleCopyArn}
      />

      {/* Main Full-Screen Content Canvas */}
      <main className="flex-1 w-full px-6 sm:px-10 lg:px-14 py-8 sm:py-10 flex flex-col">
          {!selectedQueue ? (
            /* Apple Empty State */
            <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center my-auto">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 border-t-white/20 flex items-center justify-center text-zinc-400 mb-6 shadow-2xl backdrop-blur-xl">
                <Layers className="w-8 h-8 text-zinc-400" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight mb-2">No Queues Found</h2>
              <p className="text-xs text-zinc-400 max-w-md mb-8 font-sans leading-relaxed">
                Create your first simulated distributed queue to begin generating traffic bursts, injecting poison pill chaos, and analyzing real-time CloudWatch telemetry.
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 bg-white/90 hover:bg-white active:scale-[0.98] text-black text-xs font-semibold px-5 py-2.5 rounded-full shadow-lg shadow-white/5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Your First Queue</span>
              </button>
            </div>
          ) : (
            <>
              {/* Glass Floating Metrics Bar */}
              <MetricsCards
                queue={selectedQueue}
                onOpenDLQTab={() => setActiveTab('dlq')}
              />

              {/* Tab 1 Content: Message Simulator */}
              {activeTab === 'simulator' && (
                <MessageSimulatorTab
                  queue={selectedQueue}
                  onSendMessage={handleSendMessage}
                  onPollMessages={handlePollMessages}
                  onAcknowledgeMessage={handleAcknowledgeMessage}
                  onSimulateFailure={handleSimulateFailure}
                  onPurgeQueue={async () => {
                    setQueueToPurge(selectedQueue);
                  }}
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
            </>
          )}
        </main>

      {/* Full-Width Status Bar (Footer) */}
      <footer className="border-t border-white/10 bg-black/40 backdrop-blur-xl py-4 px-6 sm:px-10 lg:px-14 text-[11px] text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono mt-auto">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-zinc-400">Inspectr</span>
          <span className="text-zinc-700">•</span>
          <span>Distributed Queue Simulator &amp; Visual Console</span>
        </div>
        <div className="flex items-center gap-3 text-zinc-500">
          <span>api: :3001</span>
          <span className="text-zinc-800">•</span>
          <span>redis: :6379</span>
          <span className="text-zinc-800">•</span>
          <span>Full Screen Console</span>
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

      {/* Purge Queue Confirmation Modal */}
      <PurgeQueueModal
        isOpen={!!queueToPurge}
        queue={queueToPurge}
        onClose={() => setQueueToPurge(null)}
        onConfirmPurge={handleConfirmPurge}
      />

      {/* Delete Queue Danger Confirmation Modal */}
      <DeleteQueueModal
        isOpen={!!queueToDelete}
        queue={queueToDelete}
        onClose={() => setQueueToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
}

export default App;
