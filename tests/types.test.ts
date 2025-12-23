/**
 * Basic type tests to verify project setup
 */

import { 
  RuleType, 
  RuleAction, 
  DetectionRule,
  PreFilterRequest,
  PostFilterRequest,
  RULE_ACTION_PRIORITY
} from '../src/types';

describe('TamengAI Types', () => {
  describe('Detection Types', () => {
    it('should have correct rule action priorities', () => {
      expect(RULE_ACTION_PRIORITY.BLOCK).toBeGreaterThan(RULE_ACTION_PRIORITY.FLAG);
      expect(RULE_ACTION_PRIORITY.FLAG).toBeGreaterThan(RULE_ACTION_PRIORITY.LOG);
    });

    it('should allow creating a valid DetectionRule', () => {
      const rule: DetectionRule = {
        id: 'test-rule-1',
        name: 'Test Rule',
        type: 'KEYWORD',
        pattern: 'test',
        action: 'BLOCK',
        severity: 'HIGH',
        language: 'BOTH',
        enabled: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(rule.id).toBe('test-rule-1');
      expect(rule.type).toBe('KEYWORD');
      expect(rule.action).toBe('BLOCK');
    });
  });

  describe('Filter Types', () => {
    it('should allow creating a valid PreFilterRequest', () => {
      const request: PreFilterRequest = {
        requestId: 'req-123',
        prompt: 'Hello, how are you?',
        userId: 'user-456',
        metadata: {
          clientIp: '127.0.0.1',
          userAgent: 'TestAgent/1.0',
          sessionId: 'session-789',
          language: 'EN',
          source: 'WEB'
        },
        timestamp: new Date()
      };

      expect(request.requestId).toBe('req-123');
      expect(request.metadata.language).toBe('EN');
    });

    it('should allow creating a valid PostFilterRequest', () => {
      const request: PostFilterRequest = {
        requestId: 'req-123',
        originalPrompt: 'Hello',
        llmOutput: 'Hi there!',
        metadata: {
          clientIp: '127.0.0.1',
          userAgent: 'TestAgent/1.0',
          sessionId: 'session-789',
          language: 'EN',
          source: 'API'
        },
        timestamp: new Date()
      };

      expect(request.llmOutput).toBe('Hi there!');
      expect(request.metadata.source).toBe('API');
    });
  });
});
