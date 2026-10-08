import type {
  Queue,
  Message,
  DLQMessage,
  HealthStatus,
  CreateQueueData,
  BurstLoadResponse,
  QueueMetricPoint,
} from '../types';

const API_BASE = '/api';

export class ApiClient {
  public static async getHealth(): Promise<HealthStatus> {
    const res = await fetch('/health');
    if (!res.ok) throw new Error(`Health check failed with status ${res.status}`);
    return res.json();
  }

  public static async listQueues(): Promise<Queue[]> {
    const res = await fetch(`${API_BASE}/queues`);
    if (!res.ok) throw new Error(`Failed to list queues: ${res.statusText}`);
    return res.json();
  }

  public static async getQueue(name: string): Promise<Queue> {
    const res = await fetch(`${API_BASE}/queues/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`Failed to get queue: ${res.statusText}`);
    return res.json();
  }

  public static async createQueue(data: CreateQueueData): Promise<{ queue: Queue; created: boolean }> {
    const res = await fetch(`${API_BASE}/queues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create queue');
    return json;
  }

  public static async sendMessage(
    queueName: string,
    body: unknown,
    messageGroupId?: string,
    messageDeduplicationId?: string
  ): Promise<{ message: Message; deduplicated?: boolean }> {
    const res = await fetch(`${API_BASE}/queues/${encodeURIComponent(queueName)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body,
        messageGroupId: messageGroupId || undefined,
        messageDeduplicationId: messageDeduplicationId || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to send message');
    return json;
  }

  public static async receiveMessages(
    queueName: string,
    options: { maxMessages?: number; visibilityTimeout?: number; waitTimeSeconds?: number } = {}
  ): Promise<Message[]> {
    const params = new URLSearchParams();
    if (options.maxMessages) params.set('maxMessages', options.maxMessages.toString());
    if (options.visibilityTimeout !== undefined)
      params.set('visibilityTimeout', options.visibilityTimeout.toString());
    if (options.waitTimeSeconds !== undefined)
      params.set('waitTimeSeconds', options.waitTimeSeconds.toString());

    const url = `${API_BASE}/queues/${encodeURIComponent(queueName)}/messages?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to receive messages');
    }
    const messages = await res.json();

    // Attach visibility expiration timestamp for client-side countdown
    const vt = options.visibilityTimeout || 30;
    return messages.map((m: Message) => ({
      ...m,
      visibilityExpiresAt: Date.now() + vt * 1000,
    }));
  }

  public static async ackMessage(queueName: string, messageId: string): Promise<boolean> {
    const res = await fetch(
      `${API_BASE}/queues/${encodeURIComponent(queueName)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error('Failed to delete/acknowledge message');
    return true;
  }

  public static async simulateFailure(queueName: string, messageId: string): Promise<{ movedToDlq: boolean; receiveCount: number }> {
    const res = await fetch(
      `${API_BASE}/queues/${encodeURIComponent(queueName)}/messages/${encodeURIComponent(messageId)}/fail`,
      { method: 'POST' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to simulate failure');
    return json;
  }

  public static async purgeQueue(queueName: string): Promise<{ totalPurged: number }> {
    const res = await fetch(`${API_BASE}/queues/${encodeURIComponent(queueName)}/purge`, {
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to purge queue');
    return json;
  }

  public static async getDLQInspector(dlqName: string): Promise<DLQMessage[]> {
    const res = await fetch(`${API_BASE}/queues/${encodeURIComponent(dlqName)}/inspector`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to inspect DLQ');
    }
    return res.json();
  }

  public static async updateDLQMessage(
    dlqName: string,
    messageId: string,
    newBody: unknown
  ): Promise<DLQMessage> {
    const res = await fetch(
      `${API_BASE}/queues/${encodeURIComponent(dlqName)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newBody }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update DLQ message');
    return json.message;
  }

  public static async redriveDLQ(
    dlqName: string,
    messageIds?: string[]
  ): Promise<{ redrivenCount: number; targetQueue: string }> {
    const res = await fetch(`${API_BASE}/queues/${encodeURIComponent(dlqName)}/redrive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: messageIds && messageIds.length > 0 ? messageIds : undefined }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to redrive DLQ messages');
    return json;
  }

  public static async sendBurst(queueName: string, count = 25): Promise<BurstLoadResponse> {
    const res = await fetch(`${API_BASE}/queues/${encodeURIComponent(queueName)}/burst`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to simulate traffic burst');
    return json;
  }

  public static async getMetrics(queueName: string, intervals = 30): Promise<QueueMetricPoint[]> {
    const res = await fetch(`${API_BASE}/queues/${encodeURIComponent(queueName)}/metrics?intervals=${intervals}`);
    if (!res.ok) throw new Error(`Failed to fetch telemetry metrics: ${res.statusText}`);
    return res.json();
  }
}
