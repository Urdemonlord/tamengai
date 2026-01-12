/**
 * Property-based tests for Logging Service
 * 
 * **Feature: tamengai-security-layer, Property 11, 12**
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { LoggingService, createLoggingService } from '../../src/logging/logging-service';
import { LogEntry, LogFilter } from '../../src/types/logging';
import { PreFilterResponse, PostFilterResponse } from '../../src/types/filter';
import { RequestMetadata } from '../../src/types/common';

/**
 * Helper to create a test log entry
 */
function createTestLogEntry(overrides?: Partial<LogEntry>): LogEntry {
  const requestId = uuidv4();
  const metadata: RequestMetadata = {
    clientIp: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    sessionId: 'test-session',
    language: 'EN',
    source: 'API'
  };
  
  const preFilterResult: PreFilterResponse = {
    requestId,
    status: 'PASS',
    filteredPrompt: 'test prompt',
    matchedRules: [],
    processingTimeMs: 10
  };

  return {
    id: uuidv4(),
    requestId,
    timestamp: new Date(),
    userId: 'test-user',
    prompt: 'test prompt',
    preFilterResult,
    finalResponse: 'test response',
    metadata,
    ...overrides
  };
}

/**
 * Property 11: Complete Interaction Logging
 * **Validates: Requirements 4.1**
 */
describe('Property 11: Complete Interaction Logging', () => {
  it('should record all required fields for any processed request', async () => {
    const loggingService = createLoggingService();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),  // prompt
        fc.string({ minLength: 1, maxLength: 100 }),  // userId
        fc.string({ minLength: 1, maxLength: 200 }),  // finalResponse
        async (prompt, userId, finalResponse) => {
          const entry = createTestLogEntry({
            prompt,
            userId,
            finalResponse
          });
          
          await loggingService.log(entry);
          
          // Query to verify it was stored
          const results = await loggingService.query({ userId });
          const found = results.find(e => e.id === entry.id);
          
          // Verify all required fields are present
          return found !== undefined &&
                 found.prompt === prompt &&
                 found.userId === userId &&
                 found.preFilterResult !== undefined &&
                 found.finalResponse === finalResponse &&
                 found.metadata !== undefined &&
                 found.timestamp !== undefined;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should record LLM output when present', async () => {
    const loggingService = createLoggingService();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),  // llmOutput
        async (llmOutput) => {
          const entry = createTestLogEntry({ llmOutput });
          
          await loggingService.log(entry);
          
          const results = await loggingService.query({});
          const found = results.find(e => e.id === entry.id);
          
          return found !== undefined && found.llmOutput === llmOutput;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should record post-filter result when present', async () => {
    const loggingService = createLoggingService();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('PASS', 'FILTER'),
        async (status) => {
          const postFilterResult: PostFilterResponse = {
            requestId: uuidv4(),
            status: status as 'PASS' | 'FILTER',
            finalOutput: 'test output',
            matchedRules: [],
            processingTimeMs: 15
          };
          
          const entry = createTestLogEntry({ postFilterResult });
          
          await loggingService.log(entry);
          
          const results = await loggingService.query({});
          const found = results.find(e => e.id === entry.id);
          
          return found !== undefined && 
                 found.postFilterResult?.status === status;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 12: Blocked Request Logging
 * **Validates: Requirements 4.2, 4.3**
 */
describe('Property 12: Blocked Request Logging', () => {
  it('should record blocking reason and matched rules for blocked prompts', async () => {
    const loggingService = createLoggingService();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),  // ruleId
        fc.string({ minLength: 1, maxLength: 50 }),  // ruleName
        fc.string({ minLength: 1, maxLength: 50 }),  // matchedText
        async (ruleId, ruleName, matchedText) => {
          const preFilterResult: PreFilterResponse = {
            requestId: uuidv4(),
            status: 'BLOCK',
            safeResponse: 'Request blocked',
            matchedRules: [{
              ruleId,
              ruleName,
              matchedText,
              position: 0,
              confidence: 1.0
            }],
            processingTimeMs: 10
          };
          
          const entry = createTestLogEntry({ preFilterResult });
          
          await loggingService.log(entry);
          
          const results = await loggingService.query({ status: 'BLOCK' });
          const found = results.find(e => e.id === entry.id);
          
          return found !== undefined &&
                 found.preFilterResult.status === 'BLOCK' &&
                 found.preFilterResult.matchedRules.length > 0 &&
                 found.preFilterResult.matchedRules[0].ruleId === ruleId;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should record original output and replacement for filtered outputs', async () => {
    const loggingService = createLoggingService();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),  // original output
        fc.string({ minLength: 1, maxLength: 200 }),  // replacement
        async (llmOutput, replacement) => {
          const postFilterResult: PostFilterResponse = {
            requestId: uuidv4(),
            status: 'FILTER',
            finalOutput: replacement,
            matchedRules: [{
              ruleId: 'test-rule',
              ruleName: 'Test Rule',
              matchedText: 'harmful',
              position: 0,
              confidence: 1.0
            }],
            processingTimeMs: 15
          };
          
          const entry = createTestLogEntry({ 
            llmOutput,
            postFilterResult,
            finalResponse: replacement
          });
          
          await loggingService.log(entry);
          
          const results = await loggingService.query({ status: 'FILTER' });
          const found = results.find(e => e.id === entry.id);
          
          return found !== undefined &&
                 found.llmOutput === llmOutput &&
                 found.postFilterResult?.status === 'FILTER' &&
                 found.postFilterResult?.finalOutput === replacement;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Blocked Request Logging - Extended Tests
 */
describe('BlockedRequestLog Storage', () => {
  it('should auto-log blocked requests when pre-filter blocks', async () => {
    const loggingService = createLoggingService() as LoggingService;

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),  // prompt
        async (prompt) => {
          const preFilterResult: PreFilterResponse = {
            requestId: uuidv4(),
            status: 'BLOCK',
            safeResponse: 'Blocked',
            matchedRules: [{
              ruleId: 'test-rule',
              ruleName: 'Test',
              matchedText: 'test',
              position: 0,
              confidence: 1.0
            }],
            processingTimeMs: 10
          };
          
          const entry = createTestLogEntry({ prompt, preFilterResult });
          await loggingService.log(entry);
          
          // Should be auto-logged to blocked requests
          const blockedRequests = await loggingService.queryBlockedRequests({});
          const found = blockedRequests.find(b => b.requestId === entry.requestId);
          
          return found !== undefined && 
                 found.blockingReason === 'PRE_FILTER' &&
                 found.prompt === prompt;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should auto-log blocked requests when post-filter filters', async () => {
    const loggingService = createLoggingService() as LoggingService;

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),  // llmOutput
        async (llmOutput) => {
          const postFilterResult: PostFilterResponse = {
            requestId: uuidv4(),
            status: 'FILTER',
            finalOutput: 'Filtered response',
            matchedRules: [{
              ruleId: 'post-rule',
              ruleName: 'Post Test',
              matchedText: 'harmful',
              position: 0,
              confidence: 1.0
            }],
            processingTimeMs: 15
          };
          
          const entry = createTestLogEntry({ llmOutput, postFilterResult });
          await loggingService.log(entry);
          
          // Should be auto-logged to blocked requests
          const blockedRequests = await loggingService.queryBlockedRequests({ 
            blockingReason: 'POST_FILTER' 
          });
          const found = blockedRequests.find(b => b.requestId === entry.requestId);
          
          return found !== undefined && 
                 found.blockingReason === 'POST_FILTER' &&
                 found.originalOutput === llmOutput;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should provide accurate statistics', async () => {
    const loggingService = createLoggingService() as LoggingService;
    
    // Add pre-filter blocked entries
    for (let i = 0; i < 3; i++) {
      const preFilterResult: PreFilterResponse = {
        requestId: uuidv4(),
        status: 'BLOCK',
        safeResponse: 'Blocked',
        matchedRules: [{
          ruleId: 'rule-1',
          ruleName: 'Rule 1',
          matchedText: 'test',
          position: 0,
          confidence: 1.0
        }],
        processingTimeMs: 10
      };
      await loggingService.log(createTestLogEntry({ preFilterResult }));
    }
    
    // Add post-filter blocked entries
    for (let i = 0; i < 2; i++) {
      const postFilterResult: PostFilterResponse = {
        requestId: uuidv4(),
        status: 'FILTER',
        finalOutput: 'Filtered',
        matchedRules: [{
          ruleId: 'rule-2',
          ruleName: 'Rule 2',
          matchedText: 'harmful',
          position: 0,
          confidence: 1.0
        }],
        processingTimeMs: 15
      };
      await loggingService.log(createTestLogEntry({ postFilterResult }));
    }
    
    const stats = await loggingService.getStats();
    
    expect(stats.blockedByPreFilter).toBe(3);
    expect(stats.blockedByPostFilter).toBe(2);
    expect(stats.topBlockedRules.length).toBeGreaterThan(0);
  });
});

/**
 * Additional Logging tests
 */
describe('LoggingService', () => {
  it('should support querying by date range', async () => {
    const loggingService = createLoggingService();
    
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const entry = createTestLogEntry({ timestamp: now });
    await loggingService.log(entry);
    
    // Should find entry in range
    const inRange = await loggingService.query({ startDate: yesterday, endDate: tomorrow });
    expect(inRange.some(e => e.id === entry.id)).toBe(true);
    
    // Should not find entry outside range
    const outOfRange = await loggingService.query({ 
      startDate: new Date(now.getTime() + 1000),
      endDate: tomorrow 
    });
    expect(outOfRange.some(e => e.id === entry.id)).toBe(false);
  });

  it('should support pagination', async () => {
    const loggingService = createLoggingService();
    
    // Add multiple entries
    for (let i = 0; i < 10; i++) {
      await loggingService.log(createTestLogEntry());
    }
    
    // Query with limit
    const page1 = await loggingService.query({ limit: 5, offset: 0 });
    const page2 = await loggingService.query({ limit: 5, offset: 5 });
    
    expect(page1.length).toBe(5);
    expect(page2.length).toBe(5);
    
    // Pages should not overlap
    const page1Ids = new Set(page1.map(e => e.id));
    const hasOverlap = page2.some(e => page1Ids.has(e.id));
    expect(hasOverlap).toBe(false);
  });

  it('should track storage usage', async () => {
    const loggingService = createLoggingService();
    
    // Add some entries
    for (let i = 0; i < 5; i++) {
      await loggingService.log(createTestLogEntry());
    }
    
    const usage = await loggingService.getStorageUsage();
    
    expect(usage.entryCount).toBe(5);
    expect(usage.percentUsed).toBeGreaterThan(0);
    expect(usage.oldestEntryDate).not.toBeNull();
  });
});
