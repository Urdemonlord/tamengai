/**
 * Property-based tests for rule validation
 * 
 * **Feature: tamengai-security-layer, Property 10: Rule Syntax Validation**
 * **Validates: Requirements 3.5**
 */

import * as fc from 'fast-check';
import { validateRule, validateRegexPattern, createRule } from '../../src/detection/rule';
import { DetectionEngine } from '../../src/detection/engine';
import { DetectionRule, RuleType, RuleAction, RuleSeverity } from '../../src/types';
import { Language } from '../../src/types/common';

describe('Property 10: Rule Syntax Validation', () => {
  /**
   * Property: For any detection rule with invalid pattern syntax,
   * the Detection Engine SHALL reject the rule and return validation errors
   * without modifying the active ruleset
   */
  
  describe('validateRegexPattern', () => {
    it('should accept valid regex patterns', () => {
      const validPatterns = [
        'simple',
        'word\\s+word',
        '^start',
        'end$',
        '[a-z]+',
        '(group)',
        'a|b',
        'a{1,3}',
        '\\d+',
        '.*'
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...validPatterns),
          (pattern) => {
            const result = validateRegexPattern(pattern);
            return result.valid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid regex patterns', () => {
      const invalidPatterns = [
        '[unclosed',
        '(unclosed',
        '*invalid',
        '+invalid',
        '?invalid',
        '\\',  // trailing backslash
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...invalidPatterns),
          (pattern) => {
            const result = validateRegexPattern(pattern);
            return result.valid === false && result.error !== undefined;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateRule', () => {
    it('should accept valid rules', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),  // name (non-whitespace)
          fc.constantFrom<RuleType>('KEYWORD', 'SARA', 'HOAX', 'MALWARE'),  // Types that don't require regex
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),  // pattern (non-whitespace)
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          fc.constantFrom<RuleSeverity>('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
          fc.constantFrom<Language>('ID', 'EN', 'BOTH'),
          (name, type, pattern, action, severity, language) => {
            const rule: Partial<DetectionRule> = {
              name,
              type,
              pattern,
              action,
              severity,
              language
            };
            
            const result = validateRule(rule);
            return result.valid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid regex-based rules', () => {
      const validRegexPatterns = ['test', 'word\\s+word', '^start', 'end$', '[a-z]+', 'a|b'];
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.constantFrom<RuleType>('PATTERN', 'INJECTION', 'JAILBREAK'),
          fc.constantFrom(...validRegexPatterns),
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          (name, type, pattern, action) => {
            const rule: Partial<DetectionRule> = {
              name,
              type,
              pattern,
              action
            };
            
            const result = validateRule(rule);
            return result.valid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject rules with empty name', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\t', '\n'),  // empty/whitespace names
          (name) => {
            const rule: Partial<DetectionRule> = {
              name,
              type: 'KEYWORD',
              pattern: 'test'
            };
            
            const result = validateRule(rule);
            return result.valid === false && 
                   result.errors.some(e => e.includes('name'));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject rules with empty pattern', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\t', '\n'),  // empty/whitespace patterns
          (pattern) => {
            const rule: Partial<DetectionRule> = {
              name: 'Test Rule',
              type: 'KEYWORD',
              pattern
            };
            
            const result = validateRule(rule);
            return result.valid === false && 
                   result.errors.some(e => e.includes('pattern'));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject rules with invalid type', () => {
      const invalidTypes = ['INVALID', 'keyword', 'Pattern', 'unknown', ''];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...invalidTypes),
          (type) => {
            const rule: Partial<DetectionRule> = {
              name: 'Test Rule',
              type: type as RuleType,
              pattern: 'test'
            };
            
            const result = validateRule(rule);
            return result.valid === false && 
                   result.errors.some(e => e.includes('type'));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject PATTERN rules with invalid regex', () => {
      const invalidRegexPatterns = ['[unclosed', '(unclosed', '*invalid'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...invalidRegexPatterns),
          (pattern) => {
            const rule: Partial<DetectionRule> = {
              name: 'Test Rule',
              type: 'PATTERN',
              pattern
            };
            
            const result = validateRule(rule);
            return result.valid === false && 
                   result.errors.some(e => e.includes('regex') || e.includes('pattern'));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Detection Engine rule validation', () => {
    it('should not add invalid rules to the ruleset', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('', '   '),  // invalid name
          async (invalidName) => {
            const engine = new DetectionEngine();
            const initialRules = await engine.getRules();
            const initialCount = initialRules.length;

            const invalidRule = createRule({
              name: 'Valid Name',  // Will be overwritten
              type: 'KEYWORD',
              pattern: 'test'
            });
            invalidRule.name = invalidName;  // Make it invalid

            try {
              await engine.addRule(invalidRule);
              return false;  // Should have thrown
            } catch (error) {
              // Verify ruleset unchanged
              const currentRules = await engine.getRules();
              return currentRules.length === initialCount;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should add valid rules to the ruleset', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),  // valid name
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),  // valid pattern
          async (name, pattern) => {
            const engine = new DetectionEngine();
            const initialRules = await engine.getRules();
            const initialCount = initialRules.length;

            const validRule = createRule({
              name,
              type: 'KEYWORD',
              pattern
            });

            await engine.addRule(validRule);
            
            const currentRules = await engine.getRules();
            return currentRules.length === initialCount + 1;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
