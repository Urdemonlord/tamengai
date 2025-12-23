/**
 * API Gateway Property Tests
 * Tests Properties 13, 14, 15 from design document
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiGateway,
  createApiGateway,
  FilterInputRequest,
  FilterOutputRequest,
  RequestContext
} from '../../src/api/gateway';
import { createRateLimiter, RateLimiter } from '../../src/api/middleware/rate-limiter';
import { createAuthMiddleware, AuthMiddleware } from '../../src/api/middleware/auth';
import { createPreFilter } from '../../src/filters/pre-filter';
import { createPostFilter } from '../../src/filters/post-filter';
import { createDetectionEngine } from '../../src/detection/engine';
import { ErrorResponse, SafeApiResponse } from '../../src/types/api';

describe('API Gateway Property Tests', () => {
  let gateway: ApiGateway;
  let detectionEngine: ReturnType<typeof createDetectionEngine>;

  beforeEach(() => {
    detectionEngine = createDetectionEngine();
    gateway = createApiGateway({
      enableAuth: true,
      enableRateLimit: true,
      rateLimitConfig: { maxRequests: 10, windowMs: 1000 }
    });
    gateway.setPreFilter(createPreFilter(detectionEngine));
    gateway.setPostFilter(createPostFilter(detectionEngine));
    gateway.setDetectionEngine(detectionEngine);
  });

  /**
   * Property 13: Authentication Precedes Filtering
   * For any request with invalid or missing authentication, the API Gateway
   * SHALL reject the request before it reaches the TamengAI filters.
   */
  describe('Property 13: Authentication Precedes Filtering', () => {
    // Generator for invalid auth headers
    const invalidAuthHeaderGen = fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('Basic invalid'),
      fc.constant('Bearer '),
      fc.constant('Bearer short'),
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.startsWith('Bearer '))
    );

    // Generator for valid auth headers
    const validAuthHeaderGen = fc.string({ minLength: 10, maxLength: 50 })
      .map(s => `Bearer ${s}`);

    // Generator for request context
    const contextGen = (authHeader?: string) => fc.record({
      requestId: fc.uuid(),
      authHeader: fc.constant(authHeader),
      clientIp: fc.ipV4(),
      userAgent: fc.string({ minLength: 1, maxLength: 100 })
    });

    // Generator for filter input request
    const filterInputRequestGen = fc.record({
      prompt: fc.string({ minLength: 1, maxLength: 500 }),
      userId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
    });

    it('**Feature: tamengai-security-layer, Property 13: Requests with missing auth are rejected with 401**', async () => {
      await fc.assert(
        fc.asyncProperty(
          filterInputRequestGen,
          contextGen(undefined),
          async (body, context) => {
            const result = await gateway.filterInput(body, context as RequestContext);
            
            // Should be rejected
            expect(result.success).toBe(false);
            const errorResult = result as ErrorResponse;
            expect(errorResult.error.code).toBe('401');
            expect(errorResult.error.message).toContain('authorization');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 13: Requests with invalid auth format are rejected with 401**', async () => {
      await fc.assert(
        fc.asyncProperty(
          filterInputRequestGen,
          invalidAuthHeaderGen.filter(h => h !== undefined),
          fc.ipV4(),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (body, authHeader, clientIp, userAgent) => {
            const context: RequestContext = {
              requestId: uuidv4(),
              authHeader: authHeader as string,
              clientIp,
              userAgent
            };
            
            const result = await gateway.filterInput(body, context);
            
            // Should be rejected
            expect(result.success).toBe(false);
            const errorResult = result as ErrorResponse;
            expect(errorResult.error.code).toBe('401');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 13: Requests with valid auth proceed to filtering**', async () => {
      await fc.assert(
        fc.asyncProperty(
          filterInputRequestGen,
          validAuthHeaderGen,
          fc.ipV4(),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (body, authHeader, clientIp, userAgent) => {
            const context: RequestContext = {
              requestId: uuidv4(),
              authHeader,
              clientIp,
              userAgent
            };
            
            const result = await gateway.filterInput(body, context);
            
            // Should succeed (not 401)
            if (!result.success) {
              const errorResult = result as ErrorResponse;
              expect(errorResult.error.code).not.toBe('401');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 13: Auth check happens before filter processing for output endpoint**', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            originalPrompt: fc.string({ minLength: 1, maxLength: 200 }),
            llmOutput: fc.string({ minLength: 1, maxLength: 500 })
          }),
          invalidAuthHeaderGen,
          fc.ipV4(),
          async (body, authHeader, clientIp) => {
            const context: RequestContext = {
              requestId: uuidv4(),
              authHeader: authHeader as string | undefined,
              clientIp,
              userAgent: 'test-agent'
            };
            
            const result = await gateway.filterOutput(body, context);
            
            // Should be rejected with 401
            expect(result.success).toBe(false);
            const errorResult = result as ErrorResponse;
            expect(errorResult.error.code).toBe('401');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: Rate Limit Enforcement
   * For any client exceeding the configured rate limit, the API Gateway
   * SHALL return HTTP 429 status with retry-after information.
   */
  describe('Property 14: Rate Limit Enforcement', () => {
    it('**Feature: tamengai-security-layer, Property 14: Requests within limit are allowed**', async () => {
      const rateLimiter = createRateLimiter({ maxRequests: 5, windowMs: 10000 });
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.integer({ min: 1, max: 5 }),
          async (clientId, requestCount) => {
            rateLimiter.reset(clientId);
            
            for (let i = 0; i < requestCount; i++) {
              const result = rateLimiter.checkLimit(clientId);
              expect(result.allowed).toBe(true);
              expect(result.info.remaining).toBe(5 - i - 1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 14: Requests exceeding limit are rejected with retry-after**', async () => {
      const rateLimiter = createRateLimiter({ maxRequests: 3, windowMs: 10000 });
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.integer({ min: 1, max: 10 }),
          async (clientId, extraRequests) => {
            rateLimiter.reset(clientId);
            
            // Exhaust the limit
            for (let i = 0; i < 3; i++) {
              rateLimiter.checkLimit(clientId);
            }
            
            // Additional requests should be rejected
            for (let i = 0; i < extraRequests; i++) {
              const result = rateLimiter.checkLimit(clientId);
              expect(result.allowed).toBe(false);
              expect(result.info.remaining).toBe(0);
              expect(result.retryAfterMs).toBeDefined();
              expect(result.retryAfterMs).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 14: Rate limit resets after window expires**', async () => {
      const windowMs = 50; // Short window for testing
      const rateLimiter = createRateLimiter({ maxRequests: 2, windowMs });
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),
          async (clientId) => {
            rateLimiter.reset(clientId);
            
            // Exhaust the limit
            rateLimiter.checkLimit(clientId);
            rateLimiter.checkLimit(clientId);
            
            // Should be blocked
            let result = rateLimiter.checkLimit(clientId);
            expect(result.allowed).toBe(false);
            
            // Wait for window to expire
            await new Promise(resolve => setTimeout(resolve, windowMs + 10));
            
            // Should be allowed again
            result = rateLimiter.checkLimit(clientId);
            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 14: Gateway returns 429 when rate limited**', async () => {
      const testGateway = createApiGateway({
        enableAuth: false, // Disable auth for this test
        enableRateLimit: true,
        rateLimitConfig: { maxRequests: 2, windowMs: 10000 }
      });
      testGateway.setPreFilter(createPreFilter(detectionEngine));
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.ipV4(),
          async (prompt, clientIp) => {
            // Reset rate limiter for this client
            testGateway.getRateLimiter().reset(clientIp);
            
            const context: RequestContext = {
              requestId: uuidv4(),
              clientIp,
              userAgent: 'test-agent'
            };
            const body: FilterInputRequest = { prompt };
            
            // First two requests should succeed
            await testGateway.filterInput(body, context);
            await testGateway.filterInput(body, context);
            
            // Third request should be rate limited
            const result = await testGateway.filterInput(body, context);
            
            expect(result.success).toBe(false);
            const errorResult = result as ErrorResponse;
            expect(errorResult.error.code).toBe('429');
            expect(errorResult.error.message).toContain('Rate limit');
            expect(errorResult.error.retryAfter).toBeDefined();
            expect(errorResult.error.retryAfter).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 14: Different clients have independent rate limits**', async () => {
      const rateLimiter = createRateLimiter({ maxRequests: 2, windowMs: 10000 });
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.length >= 5),
          async (client1, client2) => {
            // Ensure different clients
            if (client1 === client2) return;
            
            rateLimiter.reset(client1);
            rateLimiter.reset(client2);
            
            // Exhaust client1's limit
            rateLimiter.checkLimit(client1);
            rateLimiter.checkLimit(client1);
            
            // Client1 should be blocked
            expect(rateLimiter.checkLimit(client1).allowed).toBe(false);
            
            // Client2 should still be allowed
            expect(rateLimiter.checkLimit(client2).allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15: Graceful LLM Unavailability Handling
   * For any request when the LLM Core is unavailable, the System SHALL return
   * a user-friendly error message without exposing internal system details.
   */
  describe('Property 15: Graceful LLM Unavailability Handling', () => {
    it('**Feature: tamengai-security-layer, Property 15: Returns user-friendly message when LLM unavailable**', async () => {
      const testGateway = createApiGateway({
        enableAuth: false,
        enableRateLimit: false
      });
      testGateway.setPostFilter(createPostFilter(detectionEngine));
      testGateway.setLlmAvailable(false);
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (originalPrompt, llmOutput) => {
            const context: RequestContext = {
              requestId: uuidv4(),
              clientIp: '127.0.0.1',
              userAgent: 'test-agent'
            };
            const body: FilterOutputRequest = { originalPrompt, llmOutput };
            
            const result = await testGateway.filterOutput(body, context);
            
            // Should return a safe response
            expect(result.success).toBe(true);
            const safeResult = result as SafeApiResponse;
            expect(safeResult.data.type).toBe('ERROR');
            expect(safeResult.data.message).toBeDefined();
            expect(safeResult.data.message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 15: Error message does not expose internal details**', async () => {
      const testGateway = createApiGateway({
        enableAuth: false,
        enableRateLimit: false
      });
      testGateway.setPostFilter(createPostFilter(detectionEngine));
      testGateway.setLlmAvailable(false);
      
      // Internal terms that should NOT appear in user-facing messages
      const internalTerms = [
        'exception',
        'stack trace',
        'internal error',
        'server error',
        'null pointer',
        'undefined is not',
        'TypeError',
        'Error:',
        'node_modules',
        'src/',
        '.ts:',
        '.js:'
      ];
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (originalPrompt, llmOutput) => {
            const context: RequestContext = {
              requestId: uuidv4(),
              clientIp: '127.0.0.1',
              userAgent: 'test-agent'
            };
            const body: FilterOutputRequest = { originalPrompt, llmOutput };
            
            const result = await testGateway.filterOutput(body, context);
            
            expect(result.success).toBe(true);
            const safeResult = result as SafeApiResponse;
            const message = safeResult.data.message.toLowerCase();
            
            // Verify no internal details are exposed
            for (const term of internalTerms) {
              expect(message).not.toContain(term.toLowerCase());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('**Feature: tamengai-security-layer, Property 15: Normal operation when LLM is available**', async () => {
      const testGateway = createApiGateway({
        enableAuth: false,
        enableRateLimit: false
      });
      testGateway.setPostFilter(createPostFilter(detectionEngine));
      testGateway.setLlmAvailable(true);
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (originalPrompt, llmOutput) => {
            const context: RequestContext = {
              requestId: uuidv4(),
              clientIp: '127.0.0.1',
              userAgent: 'test-agent'
            };
            const body: FilterOutputRequest = { originalPrompt, llmOutput };
            
            const result = await testGateway.filterOutput(body, context);
            
            // Should succeed with filter result (not graceful error)
            expect(result.success).toBe(true);
            
            // If it's a SafeApiResponse, it should not be ERROR type
            if ('data' in result && 'type' in (result as SafeApiResponse).data) {
              const safeResult = result as SafeApiResponse;
              // This would only happen if content was filtered, not due to LLM unavailability
              expect(['BLOCKED', 'FILTERED']).toContain(safeResult.data.type);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional integration tests
   */
  describe('API Gateway Integration', () => {
    it('Health check returns correct component status', async () => {
      const health = await gateway.healthCheck();
      
      expect(health.status).toBeDefined();
      expect(health.components).toBeDefined();
      expect(health.components.preFilter).toBe(true);
      expect(health.components.postFilter).toBe(true);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('Health check reflects unhealthy state when no filters configured', async () => {
      const emptyGateway = createApiGateway();
      const health = await emptyGateway.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.components.preFilter).toBe(false);
      expect(health.components.postFilter).toBe(false);
    });

    it('Validates request body for filterInput', async () => {
      const testGateway = createApiGateway({ enableAuth: false, enableRateLimit: false });
      testGateway.setPreFilter(createPreFilter(detectionEngine));
      
      const context: RequestContext = {
        requestId: uuidv4(),
        clientIp: '127.0.0.1',
        userAgent: 'test-agent'
      };
      
      // Missing prompt
      const result = await testGateway.filterInput({} as FilterInputRequest, context);
      
      expect(result.success).toBe(false);
      const errorResult = result as ErrorResponse;
      expect(errorResult.error.code).toBe('400');
    });

    it('Validates request body for filterOutput', async () => {
      const testGateway = createApiGateway({ enableAuth: false, enableRateLimit: false });
      testGateway.setPostFilter(createPostFilter(detectionEngine));
      
      const context: RequestContext = {
        requestId: uuidv4(),
        clientIp: '127.0.0.1',
        userAgent: 'test-agent'
      };
      
      // Missing llmOutput
      const result = await testGateway.filterOutput(
        { originalPrompt: 'test' } as FilterOutputRequest,
        context
      );
      
      expect(result.success).toBe(false);
      const errorResult = result as ErrorResponse;
      expect(errorResult.error.code).toBe('400');
    });
  });
});
