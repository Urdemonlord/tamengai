/**
 * Configuration Manager - Dynamic configuration management with audit trail
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SystemConfig,
  ConfigChange,
  ConfigChangeType,
  SafeResponseTemplate,
  SafeResponseTrigger,
  IConfigurationManager
} from '../types/config';
import { Language, ValidationResult } from '../types/common';
import { DetectionRule, IDetectionEngine } from '../types/detection';
import { SafeResponseManager } from './safe-response';

/** Default system configuration */
const DEFAULT_CONFIG: SystemConfig = {
  preFilterEnabled: true,
  postFilterEnabled: true,
  llmJudgeEnabled: false,
  maxProcessingTimeMs: 500,
  defaultAction: 'BLOCK',
  confidenceThreshold: 0.7,
  safeResponseTemplates: [],
  version: 1,
  updatedAt: new Date(),
  updatedBy: 'system'
};

/**
 * Configuration Manager implementation
 */
export class ConfigurationManager implements IConfigurationManager {
  private config: SystemConfig;
  private history: ConfigChange[] = [];
  private safeResponseManager: SafeResponseManager;
  private detectionEngine?: IDetectionEngine;

  constructor(
    initialConfig?: Partial<SystemConfig>,
    detectionEngine?: IDetectionEngine
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...initialConfig,
      updatedAt: new Date()
    };
    this.safeResponseManager = new SafeResponseManager(this.config.safeResponseTemplates);
    this.detectionEngine = detectionEngine;
  }

  /**
   * Get current configuration
   */
  async getConfig(): Promise<SystemConfig> {
    return { ...this.config };
  }


  /**
   * Update configuration with validation and audit logging
   */
  async updateConfig(updates: Partial<SystemConfig>, adminId: string): Promise<void> {
    // Validate updates
    const validation = this.validateConfigUpdates(updates);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Store previous value for audit
    const previousValue = JSON.stringify(this.config);

    // Apply updates
    const newConfig: SystemConfig = {
      ...this.config,
      ...updates,
      version: this.config.version + 1,
      updatedAt: new Date(),
      updatedBy: adminId
    };

    // Log the change
    this.logConfigChange({
      adminId,
      changeType: 'UPDATE',
      previousValue,
      newValue: JSON.stringify(newConfig),
      component: 'SystemConfig'
    });

    this.config = newConfig;

    // Update safe response manager if templates changed
    if (updates.safeResponseTemplates) {
      this.safeResponseManager = new SafeResponseManager(this.config.safeResponseTemplates);
    }
  }

  /**
   * Export configuration as JSON string
   */
  async exportConfig(): Promise<string> {
    const exportData = {
      config: this.config,
      rules: this.detectionEngine ? await this.detectionEngine.getRules() : [],
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import configuration from JSON string
   */
  async importConfig(configJson: string, adminId: string): Promise<void> {
    let importData: {
      config: SystemConfig;
      rules?: DetectionRule[];
      exportedAt?: string;
      version?: string;
    };

    // Parse JSON
    try {
      importData = JSON.parse(configJson);
    } catch (e) {
      throw new Error('Invalid JSON format');
    }

    // Validate imported config
    if (!importData.config) {
      throw new Error('Missing config in import data');
    }

    const validation = this.validateConfigUpdates(importData.config);
    if (!validation.valid) {
      throw new Error(`Invalid imported configuration: ${validation.errors.join(', ')}`);
    }

    // Store previous value for audit
    const previousValue = await this.exportConfig();

    // Apply imported config
    this.config = {
      ...importData.config,
      version: this.config.version + 1,
      updatedAt: new Date(),
      updatedBy: adminId
    };

    // Convert date strings back to Date objects
    if (typeof this.config.updatedAt === 'string') {
      this.config.updatedAt = new Date(this.config.updatedAt);
    }

    // Update safe response manager
    this.safeResponseManager = new SafeResponseManager(this.config.safeResponseTemplates);

    // Import rules if detection engine is available
    if (importData.rules && this.detectionEngine) {
      for (const rule of importData.rules) {
        // Convert date strings back to Date objects
        const ruleWithDates: DetectionRule = {
          ...rule,
          createdAt: new Date(rule.createdAt),
          updatedAt: new Date(rule.updatedAt)
        };
        
        const existingRule = await this.detectionEngine.getRule(rule.id);
        if (existingRule) {
          await this.detectionEngine.updateRule(rule.id, ruleWithDates);
        } else {
          await this.detectionEngine.addRule(ruleWithDates);
        }
      }
    }

    // Log the change
    this.logConfigChange({
      adminId,
      changeType: 'UPDATE',
      previousValue,
      newValue: configJson,
      component: 'SystemConfig'
    });
  }

  /**
   * Get configuration change history
   */
  async getConfigHistory(): Promise<ConfigChange[]> {
    return [...this.history];
  }

  /**
   * Get safe response for a trigger type and language
   */
  getSafeResponse(trigger: SafeResponseTrigger, language: Language): string {
    return this.safeResponseManager.getSafeResponse(trigger, language);
  }


  /**
   * Add a detection rule dynamically (without restart)
   */
  async addRule(rule: DetectionRule, adminId: string): Promise<void> {
    if (!this.detectionEngine) {
      throw new Error('Detection engine not configured');
    }

    // Validate rule
    const validation = this.detectionEngine.validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
    }

    // Add rule
    await this.detectionEngine.addRule(rule);

    // Log the change
    this.logConfigChange({
      adminId,
      changeType: 'CREATE',
      previousValue: '',
      newValue: JSON.stringify(rule),
      component: `DetectionRule:${rule.id}`
    });
  }

  /**
   * Update a detection rule dynamically (without restart)
   */
  async updateRule(
    ruleId: string,
    updates: Partial<DetectionRule>,
    adminId: string
  ): Promise<void> {
    if (!this.detectionEngine) {
      throw new Error('Detection engine not configured');
    }

    // Get existing rule for audit
    const existingRule = await this.detectionEngine.getRule(ruleId);
    if (!existingRule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Update rule
    await this.detectionEngine.updateRule(ruleId, updates);

    // Get updated rule
    const updatedRule = await this.detectionEngine.getRule(ruleId);

    // Log the change
    this.logConfigChange({
      adminId,
      changeType: 'UPDATE',
      previousValue: JSON.stringify(existingRule),
      newValue: JSON.stringify(updatedRule),
      component: `DetectionRule:${ruleId}`
    });
  }

  /**
   * Remove a detection rule dynamically
   */
  async removeRule(ruleId: string, adminId: string): Promise<void> {
    if (!this.detectionEngine) {
      throw new Error('Detection engine not configured');
    }

    // Get existing rule for audit
    const existingRule = await this.detectionEngine.getRule(ruleId);
    if (!existingRule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Remove rule
    await this.detectionEngine.removeRule(ruleId);

    // Log the change
    this.logConfigChange({
      adminId,
      changeType: 'DELETE',
      previousValue: JSON.stringify(existingRule),
      newValue: '',
      component: `DetectionRule:${ruleId}`
    });
  }

  /**
   * Set detection engine reference
   */
  setDetectionEngine(engine: IDetectionEngine): void {
    this.detectionEngine = engine;
  }

  /**
   * Validate configuration updates
   */
  private validateConfigUpdates(updates: Partial<SystemConfig>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate maxProcessingTimeMs
    if (updates.maxProcessingTimeMs !== undefined) {
      if (typeof updates.maxProcessingTimeMs !== 'number' || 
          isNaN(updates.maxProcessingTimeMs) || 
          updates.maxProcessingTimeMs <= 0) {
        errors.push('maxProcessingTimeMs must be a positive number');
      } else if (updates.maxProcessingTimeMs > 5000) {
        warnings.push('maxProcessingTimeMs > 5000ms may cause poor user experience');
      }
    }

    // Validate confidenceThreshold
    if (updates.confidenceThreshold !== undefined) {
      if (typeof updates.confidenceThreshold !== 'number' ||
          isNaN(updates.confidenceThreshold) ||
          updates.confidenceThreshold < 0 ||
          updates.confidenceThreshold > 1) {
        errors.push('confidenceThreshold must be a number between 0 and 1');
      }
    }

    // Validate defaultAction
    if (updates.defaultAction !== undefined) {
      if (!['BLOCK', 'PASS'].includes(updates.defaultAction)) {
        errors.push('defaultAction must be BLOCK or PASS');
      }
    }

    // Validate boolean fields
    const booleanFields = ['preFilterEnabled', 'postFilterEnabled', 'llmJudgeEnabled'] as const;
    for (const field of booleanFields) {
      if (updates[field] !== undefined && typeof updates[field] !== 'boolean') {
        errors.push(`${field} must be a boolean`);
      }
    }

    // Validate safeResponseTemplates
    if (updates.safeResponseTemplates !== undefined) {
      if (!Array.isArray(updates.safeResponseTemplates)) {
        errors.push('safeResponseTemplates must be an array');
      } else {
        for (const template of updates.safeResponseTemplates) {
          if (!template.id || !template.triggerType || !template.language || !template.message) {
            errors.push('Each safe response template must have id, triggerType, language, and message');
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Log a configuration change
   */
  private logConfigChange(params: {
    adminId: string;
    changeType: ConfigChangeType;
    previousValue: string;
    newValue: string;
    component: string;
  }): void {
    const change: ConfigChange = {
      id: uuidv4(),
      timestamp: new Date(),
      adminId: params.adminId,
      changeType: params.changeType,
      previousValue: params.previousValue,
      newValue: params.newValue,
      component: params.component
    };
    this.history.push(change);
  }
}

/**
 * Create a new Configuration Manager instance
 */
export function createConfigurationManager(
  initialConfig?: Partial<SystemConfig>,
  detectionEngine?: IDetectionEngine
): ConfigurationManager {
  return new ConfigurationManager(initialConfig, detectionEngine);
}
