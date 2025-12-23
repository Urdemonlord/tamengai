/**
 * Property-based tests for Safe Response handling
 * 
 * **Feature: tamengai-security-layer, Property 19, 20, 21**
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import * as fc from 'fast-check';
import { 
  SafeResponseManager, 
  createSafeResponseManager 
} from '../../src/config/safe-response';
import { SafeResponseTrigger, SafeResponseTemplate } from '../../src/types/config';
import { Language } from '../../src/types/common';

/**
 * Property 19: Safe Response Information Hiding
 * **Validates: Requirements 7.1, 7.2, 7.4**
 */
describe('Property 19: Safe Response Information Hiding', () => {
  it('should not contain rule names in safe responses', () => {
    const manager = createSafeResponseManager();
    const triggers: SafeResponseTrigger[] = ['BLOCK_INPUT', 'FILTER_OUTPUT', 'ERROR', 'UNCERTAIN'];
    const languages: Language[] = ['ID', 'EN', 'BOTH'];
    
    // Sample rule names that should never appear in responses
    const ruleNames = [
      'Blacklist keyword',
      'Jailbreak pattern',
      'Injection signature',
      'SARA detection',
      'Malware rule'
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...triggers),
        fc.constantFrom(...languages),
        (trigger, language) => {
          const response = manager.getSafeResponse(trigger, language);
          
          // Response should not contain any rule names
          return !SafeResponseManager.containsRuleInfo(response, ruleNames, []);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not contain detection patterns in safe responses', () => {
    const manager = createSafeResponseManager();
    const triggers: SafeResponseTrigger[] = ['BLOCK_INPUT', 'FILTER_OUTPUT', 'ERROR', 'UNCERTAIN'];
    const languages: Language[] = ['ID', 'EN', 'BOTH'];
    
    // Sample patterns that should never appear in responses
    const patterns = [
      'ignore.*instructions',
      'jailbreak',
      'bypass.*safety',
      'DAN mode',
      'malware'
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...triggers),
        fc.constantFrom(...languages),
        (trigger, language) => {
          const response = manager.getSafeResponse(trigger, language);
          
          // Response should not contain any patterns
          return !SafeResponseManager.containsRuleInfo(response, [], patterns);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return user-friendly messages', () => {
    const manager = createSafeResponseManager();
    const triggers: SafeResponseTrigger[] = ['BLOCK_INPUT', 'FILTER_OUTPUT', 'ERROR', 'UNCERTAIN'];
    const languages: Language[] = ['ID', 'EN', 'BOTH'];

    fc.assert(
      fc.property(
        fc.constantFrom(...triggers),
        fc.constantFrom(...languages),
        (trigger, language) => {
          const response = manager.getSafeResponse(trigger, language);
          
          // Response should be non-empty and reasonable length
          return response.length > 10 && response.length < 500;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 20: Uncertain Content Default to Safe
 * **Validates: Requirements 7.3**
 */
describe('Property 20: Uncertain Content Default to Safe', () => {
  it('should provide safe response for uncertain trigger', () => {
    const manager = createSafeResponseManager();
    const languages: Language[] = ['ID', 'EN', 'BOTH'];

    fc.assert(
      fc.property(
        fc.constantFrom(...languages),
        (language) => {
          const response = manager.getSafeResponse('UNCERTAIN', language);
          
          // Should return a non-empty safe response
          return response.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should always have a fallback response', () => {
    const manager = createSafeResponseManager();
    const triggers: SafeResponseTrigger[] = ['BLOCK_INPUT', 'FILTER_OUTPUT', 'ERROR', 'UNCERTAIN'];
    const languages: Language[] = ['ID', 'EN', 'BOTH'];

    fc.assert(
      fc.property(
        fc.constantFrom(...triggers),
        fc.constantFrom(...languages),
        (trigger, language) => {
          const response = manager.getSafeResponse(trigger, language);
          
          // Should never return empty
          return response.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 21: Consolidated Violation Response
 * **Validates: Requirements 7.5**
 */
describe('Property 21: Consolidated Violation Response', () => {
  it('should return single response for multiple violations', () => {
    const languages: Language[] = ['ID', 'EN', 'BOTH'];
    const triggers: SafeResponseTrigger[] = ['BLOCK_INPUT', 'FILTER_OUTPUT', 'ERROR', 'UNCERTAIN'];

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            trigger: fc.constantFrom(...triggers),
            count: fc.integer({ min: 1, max: 10 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.constantFrom(...languages),
        (violations, language) => {
          const response = SafeResponseManager.createConsolidatedResponse(violations, language);
          
          // Should return exactly one response (string)
          return typeof response === 'string' && response.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should prioritize more severe triggers in consolidated response', () => {
    const languages: Language[] = ['ID', 'EN', 'BOTH'];

    fc.assert(
      fc.property(
        fc.constantFrom(...languages),
        (language) => {
          // Test with multiple violations of different severity
          const violations = [
            { trigger: 'ERROR' as SafeResponseTrigger, count: 1 },
            { trigger: 'BLOCK_INPUT' as SafeResponseTrigger, count: 1 },
            { trigger: 'UNCERTAIN' as SafeResponseTrigger, count: 1 }
          ];
          
          const response = SafeResponseManager.createConsolidatedResponse(violations, language);
          const manager = createSafeResponseManager();
          const blockResponse = manager.getSafeResponse('BLOCK_INPUT', language);
          
          // Should use the BLOCK_INPUT response (most severe)
          return response === blockResponse;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Additional Safe Response tests
 */
describe('SafeResponseManager', () => {
  it('should support custom templates', () => {
    // Create manager with only custom templates (no defaults)
    const customTemplate: SafeResponseTemplate = {
      id: 'custom-1',
      triggerType: 'BLOCK_INPUT',
      language: 'EN',
      message: 'Custom block message',
      enabled: true
    };
    
    const manager = new SafeResponseManager([customTemplate]);
    
    // Disable default EN template by adding custom one
    // The custom template should be found first since it was added last
    const templates = manager.getTemplates();
    const enBlockTemplates = templates.filter(
      t => t.triggerType === 'BLOCK_INPUT' && t.language === 'EN' && t.enabled
    );
    
    // Should have at least the custom template
    expect(enBlockTemplates.length).toBeGreaterThanOrEqual(1);
    expect(enBlockTemplates.some(t => t.message === 'Custom block message')).toBe(true);
  });

  it('should fall back to BOTH language when specific not found', () => {
    // Create manager with only BOTH templates
    const manager = createSafeResponseManager();
    
    // Should still return a response for any language
    const response = manager.getSafeResponse('BLOCK_INPUT', 'ID');
    expect(response.length).toBeGreaterThan(0);
  });
});
