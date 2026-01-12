/**
 * Logging Service types
 */

import { RequestMetadata, RuleMatch } from './common';
import { PreFilterResponse } from './filter';
import { PostFilterResponse } from './filter';

/** Log entry for a complete interaction */
export interface LogEntry {
  id: string;
  requestId: string;
  timestamp: Date;
  userId: string;
  prompt: string;
  preFilterResult: PreFilterResponse;
  llmOutput?: string;
  postFilterResult?: PostFilterResponse;
  finalResponse: string;
  metadata: RequestMetadata;
}

/** Blocked request log entry with detailed information */
export interface BlockedRequestLog {
  id: string;
  requestId: string;
  timestamp: Date;
  userId: string;
  prompt: string;
  blockingReason: 'PRE_FILTER' | 'POST_FILTER' | 'RATE_LIMIT' | 'AUTH_FAILURE';
  matchedRules: RuleMatch[];
  originalOutput?: string;  // For post-filter blocks
  replacementResponse: string;
  clientIp: string;
  userAgent: string;
  processingTimeMs: number;
}

/** Filter for querying logs */
export interface LogFilter {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  status?: 'PASS' | 'BLOCK' | 'FILTER';
  ruleId?: string;
  limit?: number;
  offset?: number;
}

/** Filter for querying blocked requests */
export interface BlockedRequestFilter {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  blockingReason?: 'PRE_FILTER' | 'POST_FILTER' | 'RATE_LIMIT' | 'AUTH_FAILURE';
  ruleId?: string;
  clientIp?: string;
  limit?: number;
  offset?: number;
}

/** Logging Service interface */
export interface ILoggingService {
  log(entry: LogEntry): Promise<void>;
  logBlockedRequest(entry: BlockedRequestLog): Promise<void>;
  query(filter: LogFilter): Promise<LogEntry[]>;
  queryBlockedRequests(filter: BlockedRequestFilter): Promise<BlockedRequestLog[]>;
  getStorageUsage(): Promise<import('./common').StorageUsage>;
  archive(beforeDate: Date): Promise<import('./common').ArchiveResult>;
  getBlockedCount(since?: Date): Promise<number>;
  getFilteredCount(since?: Date): Promise<number>;
}
