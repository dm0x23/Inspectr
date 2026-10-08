export type QueueType = 'standard' | 'fifo';

export interface QueueStats {
  readyCount: number;
  inFlightCount: number;
  totalApproximate: number;
  dlqCount?: number;
}

export interface Queue {
  name: string;
  type: QueueType;
  visibilityTimeout: number;
  maxReceiveCount: number;
  createdAt: string;
  stats: QueueStats;
}

export interface Message {
  id: string;
  body: string;
  sizeKb: number;
  enqueueTime: string;
  receiveCount: number;
  messageGroupId?: string;
  messageDeduplicationId?: string;
  receiptHandle?: string;
  visibilityExpiresAt?: number; // timestamp in ms for live countdown
}

export interface DLQMessage {
  id: string;
  body: string;
  sizeKb: number;
  enqueueTime: string;
  receiveCount: number;
  failedAt: string;
  failureReason: string;
  errorTrace: string;
  sourceQueue: string;
  messageGroupId?: string;
  messageDeduplicationId?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  redis: string;
  uptime: number;
}

export interface CreateQueueData {
  name: string;
  type: QueueType;
  visibilityTimeout: number;
  maxReceiveCount: number;
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

export interface DeleteQueueResponse {
  success: boolean;
  deleted: string;
  deletedDlq?: string;
}

export interface PurgeQueueResponse {
  success: boolean;
  purged: boolean;
  queue: string;
  purgedReady: number;
  purgedInFlight: number;
  totalPurged: number;
}

