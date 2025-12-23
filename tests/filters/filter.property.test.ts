/**
 * Property-based tests for Pre-filter and Post-filter
 * 
 * **Feature: tamengai-security-layer, Property 1, 3, 4, 5, 6**
 * **Validates: Requirements 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5**
 */

import * as fc from 'fast-check';
import { PreFilter, createPreFilter } from '../../src/filters/pre-filter';
import { PostFilter, createPostFilter } from '../../src/filters/post-filter';
import { DetectionEngine, createDetectionEngine } from '../../src/detection/engine';
import { createRule } from '../../src/detection/rule';
import { PreFilterRequest, PostFilterRequest, DetectionRule } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper to create a test request
 */
function createTestPreFilterRequest(prompt: string): PreFilterRequest {
  return {
    requestId: uuidv4(),
    prompt,
    userId: 'test-user',
    metadata: {
      clientIp: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      sessionId: 'test-session',
      language: 'EN',
      source: 'API'
    },
    timestamp: new Date()
  };
}

function createTestPostFilterRequest(llmOutput: string): PostFilterRequest {
  return {
    requestId: uuidv4(),
    originalPrompt: 'test prompt',
    llmOutput,
    metadata: {
      clientIp: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      sessionId: 'test-session',
      language: 'EN',
      source: 'API'
    },
    timestamp: new Date()
  };
}

/**
 * Property 1: Pre-filter Latency Bound
 * **Validates: Requirements 1.1**
 */
describe('Property 1: Pre-filter Latency Bound', () => {
  it('should complete analysis within 500ms for any valid prompt', async () => {
    const engine = createDetectionEngine([
      createRule({ name: 'Test', type: 'KEYWORD', pattern: 'harmful', action: 'BLOCK' })
    ]);
    const preFilter = createPreFilter(engine);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 1000 }),
        async (prompt) => {
          const request = createTestPreFilterRequest(prompt);
          const response = await preFilter.analyze(request);
          
          // Should complete within 500ms
          return response.processingTimeMs <= 500;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 3: Pre-filter Passes Safe Prompts
 * **Validates: Requirements 1.5**
 */
describe('Property 3: Pre-filter Passes Safe Prompts', () => {
  it('should pass prompts that do not match any blocking rules', async () => {
    const harmfulKeywords = ['malware', 'hack', 'exploit'];
    const rules = harmfulKeywords.map(kw => 
      createRule({ name: `Block ${kw}`, type: 'KEYWORD', pattern: kw, action: 'BLOCK' })
    );
    const engine = createDetectionEngine(rules);
    const preFilter = createPreFilter(engine);

    const safePrompts = [
      'What is the weather today?',
      'Help me write a poem about nature',
      'Explain quantum physics',
      'What are healthy recipes?',
      'Tell me about history'
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...safePrompts),
        async (prompt) => {
          const request = createTestPreFilterRequest(prompt);
          const response = await preFilter.analyze(request);
          
          return response.status === 'PASS' && 
                 response.filteredPrompt === prompt;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should return original prompt unchanged when passing', async () => {
    const engine = createDetectionEngine([]);
    const preFilter = createPreFilter(engine);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        async (prompt) => {
          const request = createTestPreFilterRequest(prompt);
          const response = await preFilter.analyze(request);
          
          if (response.status === 'PASS') {
            return response.filteredPrompt === prompt;
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 4: Post-filter Latency Bound
 * **Validates: Requirements 2.1**
 */
describe('Property 4: Post-filter Latency Bound', () => {
  it('should complete analysis within 500ms for any LLM output', async () => {
    const engine = createDetectionEngine([
      createRule({ name: 'Test', type: 'KEYWORD', pattern: 'harmful', action: 'BLOCK' })
    ]);
    const postFilter = createPostFilter(engine);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 1000 }),
        async (output) => {
          const request = createTestPostFilterRequest(output);
          const response = await postFilter.analyze(request);
          
          return response.processingTimeMs <= 500;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 5: Post-filter Blocks Harmful Outputs
 * **Validates: Requirements 2.2, 2.3, 2.4**
 */
describe('Property 5: Post-filter Blocks Harmful Outputs', () => {
  it('should filter outputs containing harmful content', async () => {
    const harmfulKeywords = ['hoax', 'sara_content', 'malware_instruction'];
    const rules = harmfulKeywords.map(kw => 
      createRule({ name: `Block ${kw}`, type: 'KEYWORD', pattern: kw, action: 'BLOCK' })
    );
    const engine = createDetectionEngine(rules);
    const postFilter = createPostFilter(engine);

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...harmfulKeywords),
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        async (keyword, prefix, suffix) => {
          const output = `${prefix} ${keyword} ${suffix}`;
          const request = createTestPostFilterRequest(output);
          const response = await postFilter.analyze(request);
          
          return response.status === 'FILTER' && 
                 response.finalOutput !== output;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should replace harmful output with safe response', async () => {
    const safeMessage = 'Content filtered for safety';
    const engine = createDetectionEngine([
      createRule({ name: 'Block harmful', type: 'KEYWORD', pattern: 'harmful', action: 'BLOCK' })
    ]);
    const postFilter = createPostFilter(engine, { safeResponseMessage: safeMessage });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 30 }),
        fc.string({ minLength: 0, maxLength: 30 }),
        async (prefix, suffix) => {
          const output = `${prefix} harmful ${suffix}`;
          const request = createTestPostFilterRequest(output);
          const response = await postFilter.analyze(request);
          
          return response.status === 'FILTER' && 
                 response.finalOutput === safeMessage;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 6: Post-filter Passes Safe Outputs
 * **Validates: Requirements 2.5**
 */
describe('Property 6: Post-filter Passes Safe Outputs', () => {
  it('should pass outputs that do not match any filtering rules', async () => {
    const harmfulKeywords = ['hoax', 'sara', 'malware'];
    const rules = harmfulKeywords.map(kw => 
      createRule({ name: `Block ${kw}`, type: 'KEYWORD', pattern: kw, action: 'BLOCK' })
    );
    const engine = createDetectionEngine(rules);
    const postFilter = createPostFilter(engine);

    const safeOutputs = [
      'The weather today is sunny with clear skies.',
      'Here is a poem about nature and beauty.',
      'Quantum physics explains the behavior of particles.',
      'Here are some healthy vegetable recipes.',
      'The history of art spans thousands of years.'
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...safeOutputs),
        async (output) => {
          const request = createTestPostFilterRequest(output);
          const response = await postFilter.analyze(request);
          
          return response.status === 'PASS' && 
                 response.finalOutput === output;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should return original output unchanged when passing', async () => {
    const engine = createDetectionEngine([]);
    const postFilter = createPostFilter(engine);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        async (output) => {
          const request = createTestPostFilterRequest(output);
          const response = await postFilter.analyze(request);
          
          if (response.status === 'PASS') {
            return response.finalOutput === output;
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Additional filter tests
 */
describe('Filter Status', () => {
  it('should track processing metrics correctly', async () => {
    const engine = createDetectionEngine([]);
    const preFilter = createPreFilter(engine);

    // Process some requests
    for (let i = 0; i < 5; i++) {
      await preFilter.analyze(createTestPreFilterRequest(`Test prompt ${i}`));
    }

    const status = preFilter.getStatus();
    
    expect(status.healthy).toBe(true);
    expect(status.lastProcessedAt).not.toBeNull();
    expect(status.averageLatencyMs).toBeGreaterThanOrEqual(0);
    expect(status.errorRate).toBe(0);
  });
});
