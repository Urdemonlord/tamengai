/**
 * Logging Service - Records all interactions for audit and dataset
 */

import { v4 as uuidv4 } from 'uuid';
import { LogEntry, LogFilter, ILoggingService } from '../types/logging';
import { StorageUsage, ArchiveResult } from '../types/common';

/**
 * In-memory Logging Service implementation
 * In production, this would be backed by a database
 */
export class LoggingService implements ILoggingService {
  private logs: Map<string, LogEntry> = new Map();
  private maxEntries: number;

  constructor(options?: { maxEntries?: number }) {
    this.maxEntries = options?.maxEntries ?? 100000;
  }

  /**
   * Log an interaction
   */
  async log(entry: LogEntry): Promise<void> {
    // Ensure entry has an ID
    if (!entry.id) {
      entry.id = uuidv4();
    }
    
    this.logs.set(entry.id, entry);
    
    // Simple cleanup if we exceed max entries
    if (this.logs.size > this.maxEntries) {
      const oldestKey = this.logs.keys().next().value;
      if (oldestKey) {
        this.logs.delete(oldestKey);
      }
    }
  }

  /**
   * Query logs with filters
   */
  async query(filter: LogFilter): Promise<LogEntry[]> {
    let results = Array.from(this.logs.values());
    
    // Apply filters
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
    
    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    
    return results.slice(offset, offset + limit);
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(): Promise<StorageUsage> {
    const entries = Array.from(this.logs.values());
    const estimatedBytesPerEntry = 2000; // Rough estimate
    const usedBytes = entries.length * estimatedBytesPerEntry;
    const totalBytes = this.maxEntries * estimatedBytesPerEntry;
    
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
      entryCount: entries.length
    };
  }

  /**
   * Archive old entries
   */
  async archive(beforeDate: Date): Promise<ArchiveResult> {
    const toArchive: LogEntry[] = [];
    
    for (const [id, entry] of this.logs.entries()) {
      if (entry.timestamp < beforeDate) {
        toArchive.push(entry);
        this.logs.delete(id);
      }
    }
    
    // In production, this would write to archive storage
    const estimatedBytesPerEntry = 2000;
    
    return {
      archivedCount: toArchive.length,
      archivedBytes: toArchive.length * estimatedBytesPerEntry,
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
   * Get blocked requests count
   */
  async getBlockedCount(since?: Date): Promise<number> {
    let count = 0;
    for (const entry of this.logs.values()) {
      if (since && entry.timestamp < since) continue;
      if (entry.preFilterResult.status === 'BLOCK') {
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
    for (const entry of this.logs.values()) {
      if (since && entry.timestamp < since) continue;
      if (entry.postFilterResult?.status === 'FILTER') {
        count++;
      }
    }
    return count;
  }
}

/**
 * Create a new LoggingService instance
 */
export function createLoggingService(options?: { maxEntries?: number }): ILoggingService {
  return new LoggingService(options);
}
