/**
 * Logging Service - Records all interactions for audit and dataset
 * Implements Property 11: Complete Interaction Logging
 * Implements Property 12: Blocked Request Logging
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  LogEntry, 
  LogFilter, 
  ILoggingService, 
  BlockedRequestLog, 
  BlockedRequestFilter 
} from '../types/logging';
import { StorageUsage, ArchiveResult } from '../types/common';

/**
 * In-memory Logging Service implementation
 * In production, this would be backed by a database
 */
export class LoggingService implements ILoggingService {
  private logs: Map<string, LogEntry> = new Map();
  private blockedRequests: Map<string, BlockedRequestLog> = new Map();
  private maxEntries: number;
  private maxBlockedEntries: number;

  constructor(options?: { maxEntries?: number; maxBlockedEntries?: number }) {
    this.maxEntries = options?.maxEntries ?? 100000;
    this.maxBlockedEntries = options?.maxBlockedEntries ?? 50000;
  }

  /**
   * Log a complete interaction
   * Property 11: Complete Interaction Logging
   */
  async log(entry: LogEntry): Promise<void> {
    if (!entry.id) {
      entry.id = uuidv4();
    }
    
    this.logs.set(entry.id, entry);
    
    // Cleanup if exceeding max entries
    if (this.logs.size > this.maxEntries) {
      const oldestKey = this.logs.keys().next().value;
      if (oldestKey) {
        this.logs.delete(oldestKey);
      }
    }

    // Auto-log blocked requests
    if (entry.preFilterResult.status === 'BLOCK') {
      await this.logBlockedRequest({
        id: uuidv4(),
        requestId: entry.requestId,
        timestamp: entry.timestamp,
        userId: entry.userId,
        prompt: entry.prompt,
        blockingReason: 'PRE_FILTER',
        matchedRules: entry.preFilterResult.matchedRules,
        replacementResponse: entry.preFilterResult.safeResponse || '',
        clientIp: entry.metadata.clientIp,
        userAgent: entry.metadata.userAgent,
        processingTimeMs: entry.preFilterResult.processingTimeMs
      });
    }

    if (entry.postFilterResult?.status === 'FILTER') {
      await this.logBlockedRequest({
        id: uuidv4(),
        requestId: entry.requestId,
        timestamp: entry.timestamp,
        userId: entry.userId,
        prompt: entry.prompt,
        blockingReason: 'POST_FILTER',
        matchedRules: entry.postFilterResult.matchedRules,
        originalOutput: entry.llmOutput,
        replacementResponse: entry.postFilterResult.finalOutput,
        clientIp: entry.metadata.clientIp,
        userAgent: entry.metadata.userAgent,
        processingTimeMs: entry.postFilterResult.processingTimeMs
      });
    }
  }

  /**
   * Log a blocked request with detailed information
   * Property 12: Blocked Request Logging
   */
  async logBlockedRequest(entry: BlockedRequestLog): Promise<void> {
    if (!entry.id) {
      entry.id = uuidv4();
    }

    this.blockedRequests.set(entry.id, entry);

    // Cleanup if exceeding max entries
    if (this.blockedRequests.size > this.maxBlockedEntries) {
      const oldestKey = this.blockedRequests.keys().next().value;
      if (oldestKey) {
        this.blockedRequests.delete(oldestKey);
      }
    }

    // Console log for monitoring (in production, send to monitoring service)
    console.log(`[BLOCKED] ${entry.blockingReason} | RequestID: ${entry.requestId} | Rules: ${entry.matchedRules.map(r => r.ruleId).join(', ')}`);
  }

  /**
   * Query logs with filters
   */
  async query(filter: LogFilter): Promise<LogEntry[]> {
    let results = Array.from(this.logs.values());
    
    if (filter.startDate) {
      results = results.filter(e => e.timestamp >= filter.startDate!);
    }
    
    if (filter.endDate) {
      results = results.filter(e => e.timestamp <= filter.endDate!);
    }
    
    if (filter.userId) {
      results = results.filter(e => e.userId === filter.userId);
    }
    
    if (filter.status) {
      results = results.filter(e => {
        if (filter.status === 'BLOCK') {
          return e.preFilterResult.status === 'BLOCK';
        }
        if (filter.status === 'FILTER') {
          return e.postFilterResult?.status === 'FILTER';
        }
        return e.preFilterResult.status === 'PASS' && 
               (!e.postFilterResult || e.postFilterResult.status === 'PASS');
      });
    }
    
    if (filter.ruleId) {
      results = results.filter(e => 
        e.preFilterResult.matchedRules.some(r => r.ruleId === filter.ruleId) ||
        e.postFilterResult?.matchedRules.some(r => r.ruleId === filter.ruleId)
      );
    }
    
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    
    return results.slice(offset, offset + limit);
  }

  /**
   * Query blocked requests with filters
   */
  async queryBlockedRequests(filter: BlockedRequestFilter): Promise<BlockedRequestLog[]> {
    let results = Array.from(this.blockedRequests.values());

    if (filter.startDate) {
      results = results.filter(e => e.timestamp >= filter.startDate!);
    }

    if (filter.endDate) {
      results = results.filter(e => e.timestamp <= filter.endDate!);
    }

    if (filter.userId) {
      results = results.filter(e => e.userId === filter.userId);
    }

    if (filter.blockingReason) {
      results = results.filter(e => e.blockingReason === filter.blockingReason);
    }

    if (filter.ruleId) {
      results = results.filter(e => 
        e.matchedRules.some(r => r.ruleId === filter.ruleId)
      );
    }

    if (filter.clientIp) {
      results = results.filter(e => e.clientIp === filter.clientIp);
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(): Promise<StorageUsage> {
    const entries = Array.from(this.logs.values());
    const blockedEntries = Array.from(this.blockedRequests.values());
    const estimatedBytesPerEntry = 2000;
    const usedBytes = (entries.length + blockedEntries.length) * estimatedBytesPerEntry;
    const totalBytes = (this.maxEntries + this.maxBlockedEntries) * estimatedBytesPerEntry;
    
    let oldestEntryDate: Date | null = null;
    if (entries.length > 0) {
      oldestEntryDate = entries.reduce(
        (oldest, e) => e.timestamp < oldest ? e.timestamp : oldest,
        entries[0].timestamp
      );
    }
    
    return {
      totalBytes,
      usedBytes,
      percentUsed: (usedBytes / totalBytes) * 100,
      oldestEntryDate,
      entryCount: entries.length + blockedEntries.length
    };
  }

  /**
   * Archive old entries
   */
  async archive(beforeDate: Date): Promise<ArchiveResult> {
    let archivedCount = 0;
    
    // Archive main logs
    for (const [id, entry] of this.logs.entries()) {
      if (entry.timestamp < beforeDate) {
        this.logs.delete(id);
        archivedCount++;
      }
    }

    // Archive blocked requests
    for (const [id, entry] of this.blockedRequests.entries()) {
      if (entry.timestamp < beforeDate) {
        this.blockedRequests.delete(id);
        archivedCount++;
      }
    }
    
    const estimatedBytesPerEntry = 2000;
    
    return {
      archivedCount,
      archivedBytes: archivedCount * estimatedBytesPerEntry,
      archiveLocation: `archive/${beforeDate.toISOString().split('T')[0]}`,
      completedAt: new Date()
    };
  }

  /**
   * Get a specific log entry by ID
   */
  async getEntry(id: string): Promise<LogEntry | null> {
    return this.logs.get(id) ?? null;
  }

  /**
   * Get entries by request ID
   */
  async getByRequestId(requestId: string): Promise<LogEntry | null> {
    for (const entry of this.logs.values()) {
      if (entry.requestId === requestId) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Get blocked request by request ID
   */
  async getBlockedByRequestId(requestId: string): Promise<BlockedRequestLog | null> {
    for (const entry of this.blockedRequests.values()) {
      if (entry.requestId === requestId) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Get blocked requests count
   */
  async getBlockedCount(since?: Date): Promise<number> {
    let count = 0;
    for (const entry of this.blockedRequests.values()) {
      if (since && entry.timestamp < since) continue;
      if (entry.blockingReason === 'PRE_FILTER') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get filtered outputs count
   */
  async getFilteredCount(since?: Date): Promise<number> {
    let count = 0;
    for (const entry of this.blockedRequests.values()) {
      if (since && entry.timestamp < since) continue;
      if (entry.blockingReason === 'POST_FILTER') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get statistics summary
   */
  async getStats(since?: Date): Promise<{
    totalRequests: number;
    blockedByPreFilter: number;
    blockedByPostFilter: number;
    blockedByRateLimit: number;
    blockedByAuth: number;
    topBlockedRules: Array<{ ruleId: string; count: number }>;
  }> {
    const stats = {
      totalRequests: this.logs.size,
      blockedByPreFilter: 0,
      blockedByPostFilter: 0,
      blockedByRateLimit: 0,
      blockedByAuth: 0,
      topBlockedRules: [] as Array<{ ruleId: string; count: number }>
    };

    const ruleCounts = new Map<string, number>();

    for (const entry of this.blockedRequests.values()) {
      if (since && entry.timestamp < since) continue;

      switch (entry.blockingReason) {
        case 'PRE_FILTER':
          stats.blockedByPreFilter++;
          break;
        case 'POST_FILTER':
          stats.blockedByPostFilter++;
          break;
        case 'RATE_LIMIT':
          stats.blockedByRateLimit++;
          break;
        case 'AUTH_FAILURE':
          stats.blockedByAuth++;
          break;
      }

      for (const rule of entry.matchedRules) {
        const count = ruleCounts.get(rule.ruleId) ?? 0;
        ruleCounts.set(rule.ruleId, count + 1);
      }
    }

    // Get top 10 blocked rules
    stats.topBlockedRules = Array.from(ruleCounts.entries())
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }
}

/**
 * Create a new LoggingService instance
 */
export function createLoggingService(options?: { 
  maxEntries?: number; 
  maxBlockedEntries?: number 
}): ILoggingService {
  return new LoggingService(options);
}
