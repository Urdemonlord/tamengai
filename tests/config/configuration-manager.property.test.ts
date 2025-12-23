/**
 * Property-based tests for Configuration Manager
 * Tests Properties 7, 8, 22, 23, 24 from design document
 */

import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import {
  ConfigurationManager,
  createConfigurationManager
} from '../../src/config/configuration-manager';
import { DetectionEngine, createDetectionEngine } from '../../src/detection/engine';
import { DetectionRule, RuleType, RuleAction, RuleSeverity } from '../../src/types/detection';
import { SystemConfig, SafeResponseTemplate } from '../../src/types/config';
import { Language } from '../../src/types/common';

// Generators
const ruleTypeGen = fc.constantFrom<RuleType>('KEYWORD', 'PATTERN', 'INJECTION', 'JAILBREAK', 'SARA', 'HOAX', 'MALWARE');
const ruleActionGen = fc.constantFrom<RuleAction>('BLOCK', 'FLAG', 'LOG');
const ruleSeverityGen = fc.constantFrom<RuleSeverity>('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
const languageGen = fc.constantFrom<Language>('ID', 'EN', 'BOTH');

// Safe pattern generator that produces valid regex patterns
const safePatternGen = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/[[\]{}()*+?.,\\^$|#\s]/g, '')).filter(s => s.length > 0),
  fc.constantFrom('test', 'keyword', 'block', 'filter', 'harmful', 'content')
);

const validRuleGen = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  type: fc.constantFrom<RuleType>('KEYWORD'), // Use KEYWORD type to avoid regex validation issues
  pattern: safePatternGen,
  action: ruleActionGen,
  severity: ruleSeverityGen,
  language: languageGen,
  enabled: fc.boolean(),
  version: fc.constant(1),
  createdAt: fc.constant(new Date()),
  updatedAt: fc.constant(new Date())
});

const adminIdGen = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

describe('Configuration Manager Property Tests', () => {
  /**
   * Property 7: Dynamic Rule Application
   * For any newly added detection rule, subsequent requests SHALL be evaluated
   * against the new rule without requiring system restart.
   */
  describe('Property 7: Dynamic Rule Application', () => {
    it('should apply new rules immediately without restart', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRuleGen,
          adminIdGen,
          async (rule, adminId) => {
            const engine = createDetectionEngine();
            const configManager = createConfigurationManager({}, engine);

            // Create a keyword rule with a known pattern
            const testPattern = 'dynamictest';
            const keywordRule: DetectionRule = {
              ...rule,
              type: 'KEYWORD',
              pattern: testPattern,
              action: 'BLOCK',
              enabled: true,
              language: 'BOTH'  // Use BOTH to match any language context
            };

            // Add rule dynamically
            await configManager.addRule(keywordRule, adminId);

            // Rule should be in the engine
            const rules = await engine.getRules();
            expect(rules.some(r => r.id === keywordRule.id)).toBe(true);
            expect(rules.find(r => r.id === keywordRule.id)?.enabled).toBe(true);

            // Analyze text containing the pattern - should detect
            const textWithPattern = `some text ${testPattern} more text`;
            const result = await engine.analyzeInput(textWithPattern, {
              language: 'EN',
              strictMode: false
            });

            // Should find the pattern
            expect(result.matches.length).toBeGreaterThan(0);
            expect(result.isHarmful).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * Property 8: Rule Version Consistency
   * For any rule update operation, the Detection Engine SHALL increment the rule
   * version and create an audit history entry with the previous and new values.
   */
  describe('Property 8: Rule Version Consistency', () => {
    it('should increment version and create audit entry on rule update', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRuleGen,
          safePatternGen,
          adminIdGen,
          async (rule, newPattern, adminId) => {
            const engine = createDetectionEngine([rule]);
            const configManager = createConfigurationManager({}, engine);

            const originalVersion = rule.version;

            // Update the rule
            await configManager.updateRule(rule.id, { pattern: newPattern }, adminId);

            // Check version was incremented
            const updatedRule = await engine.getRule(rule.id);
            expect(updatedRule).not.toBeNull();
            expect(updatedRule!.version).toBe(originalVersion + 1);

            // Check audit history was created
            const history = await configManager.getConfigHistory();
            expect(history.length).toBeGreaterThan(0);

            const lastChange = history[history.length - 1];
            expect(lastChange.changeType).toBe('UPDATE');
            expect(lastChange.adminId).toBe(adminId);
            expect(lastChange.component).toContain(rule.id);

            // Previous value should be valid JSON containing original rule
            const prevValue = JSON.parse(lastChange.previousValue);
            expect(prevValue.pattern).toBe(rule.pattern);
            
            // New value should be valid JSON containing new pattern
            const newValue = JSON.parse(lastChange.newValue);
            expect(newValue.pattern).toBe(newPattern);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 22: Configuration Validation
   * For any configuration change with invalid syntax or values, the System SHALL
   * reject the change, maintain current settings, and return validation errors.
   */
  describe('Property 22: Configuration Validation', () => {
    it('should reject invalid maxProcessingTimeMs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ max: 0 }),
            fc.constant(-100),
            fc.constant(NaN)
          ),
          adminIdGen,
          async (invalidValue, adminId) => {
            const configManager = createConfigurationManager();
            const originalConfig = await configManager.getConfig();

            // Attempt invalid update
            await expect(
              configManager.updateConfig({ maxProcessingTimeMs: invalidValue }, adminId)
            ).rejects.toThrow();

            // Config should remain unchanged
            const currentConfig = await configManager.getConfig();
            expect(currentConfig.maxProcessingTimeMs).toBe(originalConfig.maxProcessingTimeMs);
            expect(currentConfig.version).toBe(originalConfig.version);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should reject invalid confidenceThreshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.double({ min: 1.1, max: 100 }),
            fc.double({ min: -100, max: -0.1 })
          ),
          adminIdGen,
          async (invalidValue, adminId) => {
            const configManager = createConfigurationManager();
            const originalConfig = await configManager.getConfig();

            // Attempt invalid update
            await expect(
              configManager.updateConfig({ confidenceThreshold: invalidValue }, adminId)
            ).rejects.toThrow();

            // Config should remain unchanged
            const currentConfig = await configManager.getConfig();
            expect(currentConfig.confidenceThreshold).toBe(originalConfig.confidenceThreshold);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should reject invalid defaultAction', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => !['BLOCK', 'PASS'].includes(s)),
          adminIdGen,
          async (invalidAction, adminId) => {
            const configManager = createConfigurationManager();
            const originalConfig = await configManager.getConfig();

            // Attempt invalid update
            await expect(
              configManager.updateConfig({ defaultAction: invalidAction as any }, adminId)
            ).rejects.toThrow();

            // Config should remain unchanged
            const currentConfig = await configManager.getConfig();
            expect(currentConfig.defaultAction).toBe(originalConfig.defaultAction);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should accept valid configuration updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 0, max: 100 }).map(n => n / 100), // Generate valid 0-1 range
          fc.boolean(),
          adminIdGen,
          async (maxTime, threshold, preFilterEnabled, adminId) => {
            const configManager = createConfigurationManager();

            // Valid update should succeed
            await configManager.updateConfig({
              maxProcessingTimeMs: maxTime,
              confidenceThreshold: threshold,
              preFilterEnabled
            }, adminId);

            const config = await configManager.getConfig();
            expect(config.maxProcessingTimeMs).toBe(maxTime);
            expect(config.confidenceThreshold).toBe(threshold);
            expect(config.preFilterEnabled).toBe(preFilterEnabled);
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * Property 23: Configuration Audit Trail
   * For any configuration change, the System SHALL log the change with
   * administrator identity, timestamp, previous value, and new value.
   */
  describe('Property 23: Configuration Audit Trail', () => {
    it('should log all config changes with required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 5000 }),
          adminIdGen,
          async (newMaxTime, adminId) => {
            const configManager = createConfigurationManager();
            const beforeUpdate = new Date();

            await configManager.updateConfig({ maxProcessingTimeMs: newMaxTime }, adminId);

            const history = await configManager.getConfigHistory();
            expect(history.length).toBeGreaterThan(0);

            const lastChange = history[history.length - 1];

            // Check required fields
            expect(lastChange.id).toBeDefined();
            expect(lastChange.adminId).toBe(adminId);
            expect(lastChange.timestamp).toBeInstanceOf(Date);
            expect(lastChange.timestamp.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
            expect(lastChange.changeType).toBe('UPDATE');
            expect(lastChange.previousValue).toBeDefined();
            expect(lastChange.newValue).toBeDefined();
            expect(lastChange.component).toBe('SystemConfig');

            // New value should contain the updated maxProcessingTimeMs
            expect(lastChange.newValue).toContain(String(newMaxTime));
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should log rule additions with audit trail', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRuleGen,
          adminIdGen,
          async (rule, adminId) => {
            const engine = createDetectionEngine();
            const configManager = createConfigurationManager({}, engine);

            await configManager.addRule(rule, adminId);

            const history = await configManager.getConfigHistory();
            expect(history.length).toBeGreaterThan(0);

            const lastChange = history[history.length - 1];
            expect(lastChange.changeType).toBe('CREATE');
            expect(lastChange.adminId).toBe(adminId);
            expect(lastChange.component).toContain('DetectionRule');
            expect(lastChange.previousValue).toBe('');
            expect(lastChange.newValue).toContain(rule.id);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should log rule deletions with audit trail', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRuleGen,
          adminIdGen,
          async (rule, adminId) => {
            const engine = createDetectionEngine([rule]);
            const configManager = createConfigurationManager({}, engine);

            await configManager.removeRule(rule.id, adminId);

            const history = await configManager.getConfigHistory();
            expect(history.length).toBeGreaterThan(0);

            const lastChange = history[history.length - 1];
            expect(lastChange.changeType).toBe('DELETE');
            expect(lastChange.adminId).toBe(adminId);
            expect(lastChange.component).toContain(rule.id);
            expect(lastChange.previousValue).toContain(rule.id);
            expect(lastChange.newValue).toBe('');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 24: Configuration Export Round-Trip
   * For any system configuration, exporting and then importing the configuration
   * SHALL result in an equivalent configuration state.
   */
  describe('Property 24: Configuration Export Round-Trip', () => {
    it('should preserve config after export/import round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 0, max: 100 }).map(n => n / 100), // Use integer mapped to avoid NaN
          fc.boolean(),
          fc.boolean(),
          fc.constantFrom<'BLOCK' | 'PASS'>('BLOCK', 'PASS'),
          adminIdGen,
          async (maxTime, threshold, preFilter, postFilter, defaultAction, adminId) => {
            const engine = createDetectionEngine();
            const configManager = createConfigurationManager({
              maxProcessingTimeMs: maxTime,
              confidenceThreshold: threshold,
              preFilterEnabled: preFilter,
              postFilterEnabled: postFilter,
              defaultAction
            }, engine);

            // Export configuration
            const exported = await configManager.exportConfig();

            // Create new manager and import
            const newEngine = createDetectionEngine();
            const newConfigManager = createConfigurationManager({}, newEngine);
            await newConfigManager.importConfig(exported, adminId);

            // Compare configurations
            const originalConfig = await configManager.getConfig();
            const importedConfig = await newConfigManager.getConfig();

            expect(importedConfig.maxProcessingTimeMs).toBe(originalConfig.maxProcessingTimeMs);
            expect(importedConfig.confidenceThreshold).toBe(originalConfig.confidenceThreshold);
            expect(importedConfig.preFilterEnabled).toBe(originalConfig.preFilterEnabled);
            expect(importedConfig.postFilterEnabled).toBe(originalConfig.postFilterEnabled);
            expect(importedConfig.defaultAction).toBe(originalConfig.defaultAction);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should preserve rules after export/import round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validRuleGen, { minLength: 1, maxLength: 5 }),
          adminIdGen,
          async (rules, adminId) => {
            const engine = createDetectionEngine(rules);
            const configManager = createConfigurationManager({}, engine);

            // Export configuration with rules
            const exported = await configManager.exportConfig();

            // Create new manager and import
            const newEngine = createDetectionEngine();
            const newConfigManager = createConfigurationManager({}, newEngine);
            await newConfigManager.importConfig(exported, adminId);

            // Compare rules
            const originalRules = await engine.getRules();
            const importedRules = await newEngine.getRules();

            expect(importedRules.length).toBe(originalRules.length);

            for (const originalRule of originalRules) {
              const importedRule = importedRules.find(r => r.id === originalRule.id);
              expect(importedRule).toBeDefined();
              expect(importedRule!.name).toBe(originalRule.name);
              expect(importedRule!.pattern).toBe(originalRule.pattern);
              expect(importedRule!.action).toBe(originalRule.action);
              expect(importedRule!.type).toBe(originalRule.type);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should reject invalid JSON on import', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => {
            try {
              JSON.parse(s);
              return false;
            } catch {
              return true;
            }
          }),
          adminIdGen,
          async (invalidJson, adminId) => {
            const configManager = createConfigurationManager();

            await expect(
              configManager.importConfig(invalidJson, adminId)
            ).rejects.toThrow('Invalid JSON format');
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
