export type QueueType = 'standard' | 'fifo';

export interface QueueMeta {
  name: string;
  type: QueueType;
  visibilityTimeout: number;
  maxReceiveCount: number;
  createdAt: string;
}

export interface QueueStats {
  readyCount: number;
  inFlightCount: number;
  totalApproximate: number;
}

export interface QueueWithStats extends QueueMeta {
  stats: QueueStats;
}

export interface CreateQueueInput {
  name: string;
  type?: QueueType;
  visibilityTimeout?: number;
  maxReceiveCount?: number;
}

export interface SendMessageInput {
  body: string | Record<string, unknown>;
  messageGroupId?: string;
  messageDeduplicationId?: string;
}

export interface MessageMetadata {
  id: string;
  body: string;
  sizeKb: number;
  enqueueTime: string;
  receiveCount: number;
  messageGroupId?: string;
  messageDeduplicationId?: string;
}

export interface ReceiveMessageResponse extends MessageMetadata {
  receiptHandle: string;
}

export interface ReceiveMessagesOptions {
  maxMessages?: number;
  visibilityTimeout?: number;
  waitTimeSeconds?: number;
}
