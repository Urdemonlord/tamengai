/**
 * Logging Service types
 */

import { RequestMetadata } from './common';
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

/** Logging Service interface */
export interface ILoggingService {
  log(entry: LogEntry): Promise<void>;
  query(filter: LogFilter): Promise<LogEntry[]>;
  getStorageUsage(): Promise<import('./common').StorageUsage>;
  archive(beforeDate: Date): Promise<import('./common').ArchiveResult>;
}
