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
  dlqCount?: number;
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

export interface DLQMessageMetadata extends MessageMetadata {
  failedAt: string;
  failureReason: string;
  errorTrace: string;
  sourceQueue: string;
}

export interface ReceiveMessageResponse extends MessageMetadata {
  receiptHandle: string;
}

export interface ReceiveMessagesOptions {
  maxMessages?: number;
  visibilityTimeout?: number;
  waitTimeSeconds?: number;
  autoFail?: boolean;
}

export interface RedriveRequest {
  messageIds?: string[];
}

export interface RedriveResponse {
  success: boolean;
  redrivenCount: number;
  messageIds: string[];
  targetQueue?: string;
}

export interface UpdateDLQMessageInput {
  body: string | Record<string, unknown>;
}

export interface BurstLoadInput {
  count?: number;
}

export interface BurstLoadResponse {
  success: boolean;
  queue: string;
  count: number;
  messageIds: string[];
  enqueuedAt: string;
}

export interface QueueMetricPoint {
  timestamp: number;
  time: string;
  ApproximateNumberOfMessagesVisible: number;
  ApproximateNumberOfMessagesNotVisible: number;
  NumberOfMessagesSent: number;
  NumberOfMessagesReceived: number;
  NumberOfMessagesDeleted: number;
  NumberOfMessagesDeadLettered: number;
}

