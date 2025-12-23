/**
 * Property-based tests for rule precedence logic
 * 
 * **Feature: tamengai-security-layer, Property 9: Most Restrictive Rule Precedence**
 * **Validates: Requirements 3.4**
 */

import * as fc from 'fast-check';
import { getMostRestrictiveAction, compareActions } from '../../src/detection/rule';
import { DetectionEngine } from '../../src/detection/engine';
import { createRule } from '../../src/detection/rule';
import { RuleAction, RULE_ACTION_PRIORITY } from '../../src/types';

describe('Property 9: Most Restrictive Rule Precedence', () => {
  /**
   * Property: For any input matching multiple detection rules with different actions,
   * the Detection Engine SHALL apply the most restrictive action (BLOCK > FLAG > LOG)
   */
  describe('getMostRestrictiveAction', () => {
    it('should always return BLOCK when BLOCK is present', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'), { minLength: 1, maxLength: 10 }),
          (actions) => {
            // Add BLOCK to the array
            const actionsWithBlock: RuleAction[] = [...actions, 'BLOCK'];
            const result = getMostRestrictiveAction(actionsWithBlock);
            return result === 'BLOCK';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return FLAG when FLAG is most restrictive (no BLOCK)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom<RuleAction>('FLAG', 'LOG'), { minLength: 1, maxLength: 10 }),
          (actions) => {
            // Ensure at least one FLAG
            const actionsWithFlag: RuleAction[] = [...actions, 'FLAG'];
            const result = getMostRestrictiveAction(actionsWithFlag);
            return result === 'FLAG';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return LOG when only LOG actions present', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (count) => {
            const actions: RuleAction[] = Array(count).fill('LOG');
            const result = getMostRestrictiveAction(actions);
            return result === 'LOG';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain priority order: BLOCK > FLAG > LOG', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          (a, b) => {
            const result = getMostRestrictiveAction([a, b]);
            const expectedPriority = Math.max(RULE_ACTION_PRIORITY[a], RULE_ACTION_PRIORITY[b]);
            return RULE_ACTION_PRIORITY[result] === expectedPriority;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('compareActions', () => {
    it('should be commutative in terms of result restrictiveness', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          (a, b) => {
            const result1 = compareActions(a, b);
            const result2 = compareActions(b, a);
            // Both should return the same most restrictive action
            return RULE_ACTION_PRIORITY[result1] === RULE_ACTION_PRIORITY[result2];
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Detection Engine rule precedence', () => {
    it('should apply most restrictive action when multiple rules match', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 3, maxLength: 10 }),  // keyword to match
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG'),
          async (keyword, action1, action2) => {
            const engine = new DetectionEngine([
              createRule({
                name: 'Rule 1',
                type: 'KEYWORD',
                pattern: keyword,
                action: action1
              }),
              createRule({
                name: 'Rule 2',
                type: 'KEYWORD',
                pattern: keyword,
                action: action2
              })
            ]);

            const result = await engine.analyzeInput(
              `This text contains ${keyword} for testing`,
              { language: 'EN', strictMode: false }
            );

            // Should have matches
            if (result.matches.length === 0) return true;  // Skip if no matches

            // The recommended action should be the most restrictive
            // LOG action is converted to PASS (log but don't block)
            const mostRestrictive = getMostRestrictiveAction([action1, action2]);
            const expectedAction = mostRestrictive === 'LOG' ? 'PASS' : mostRestrictive;
            return result.recommendedAction === expectedAction;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return PASS when no rules match', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),  // unique keyword
          fc.string({ minLength: 10, maxLength: 50 }), // text without keyword
          async (keyword, text) => {
            // Skip if text accidentally contains keyword
            if (text.toLowerCase().includes(keyword.toLowerCase())) return true;

            const engine = new DetectionEngine([
              createRule({
                name: 'Test Rule',
                type: 'KEYWORD',
                pattern: keyword,
                action: 'BLOCK'
              })
            ]);

            const result = await engine.analyzeInput(
              text,
              { language: 'EN', strictMode: false }
            );

            return result.recommendedAction === 'PASS' && !result.isHarmful;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
