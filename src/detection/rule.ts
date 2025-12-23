/**
 * Detection Rule implementation with validation
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DetectionRule,
  RuleType,
  RuleAction,
  RuleSeverity,
  RULE_ACTION_PRIORITY
} from '../types';
import { Language, ValidationResult } from '../types/common';

/** Valid rule types */
const VALID_RULE_TYPES: RuleType[] = [
  'KEYWORD', 'PATTERN', 'INJECTION', 'JAILBREAK', 'SARA', 'HOAX', 'MALWARE'
];

/** Valid rule actions */
const VALID_RULE_ACTIONS: RuleAction[] = ['BLOCK', 'FLAG', 'LOG'];

/** Valid severity levels */
const VALID_SEVERITIES: RuleSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Valid languages */
const VALID_LANGUAGES: Language[] = ['ID', 'EN', 'BOTH'];

/**
 * Create a new detection rule with defaults
 */
export function createRule(params: {
  name: string;
  type: RuleType;
  pattern: string;
  action?: RuleAction;
  severity?: RuleSeverity;
  language?: Language;
  enabled?: boolean;
}): DetectionRule {
  const now = new Date();
  return {
    id: uuidv4(),
    name: params.name,
    type: params.type,
    pattern: params.pattern,
    action: params.action ?? 'BLOCK',
    severity: params.severity ?? 'MEDIUM',
    language: params.language ?? 'BOTH',
    enabled: params.enabled ?? true,
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Validate a regex pattern syntax
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern, 'gi');
    return { valid: true };
  } catch (e) {
    return { 
      valid: false, 
      error: e instanceof Error ? e.message : 'Invalid regex pattern' 
    };
  }
}

/**
 * Validate a detection rule
 */
export function validateRule(rule: Partial<DetectionRule>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!rule.name || rule.name.trim().length === 0) {
    errors.push('Rule name is required');
  } else if (rule.name.length > 100) {
    errors.push('Rule name must be 100 characters or less');
  }

  if (!rule.type) {
    errors.push('Rule type is required');
  } else if (!VALID_RULE_TYPES.includes(rule.type)) {
    errors.push(`Invalid rule type: ${rule.type}. Must be one of: ${VALID_RULE_TYPES.join(', ')}`);
  }

  if (!rule.pattern || rule.pattern.trim().length === 0) {
    errors.push('Rule pattern is required');
  } else {
    // Validate pattern based on rule type
    if (rule.type === 'PATTERN' || rule.type === 'INJECTION' || rule.type === 'JAILBREAK') {
      const regexValidation = validateRegexPattern(rule.pattern);
      if (!regexValidation.valid) {
        errors.push(`Invalid regex pattern: ${regexValidation.error}`);
      }
    }
  }

  // Optional fields with validation
  if (rule.action && !VALID_RULE_ACTIONS.includes(rule.action)) {
    errors.push(`Invalid rule action: ${rule.action}. Must be one of: ${VALID_RULE_ACTIONS.join(', ')}`);
  }

  if (rule.severity && !VALID_SEVERITIES.includes(rule.severity)) {
    errors.push(`Invalid severity: ${rule.severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }

  if (rule.language && !VALID_LANGUAGES.includes(rule.language)) {
    errors.push(`Invalid language: ${rule.language}. Must be one of: ${VALID_LANGUAGES.join(', ')}`);
  }

  // Warnings
  if (rule.action === 'LOG' && rule.severity === 'CRITICAL') {
    warnings.push('Critical severity rules typically use BLOCK action, not LOG');
  }

  if (rule.type === 'KEYWORD' && rule.pattern && rule.pattern.length < 3) {
    warnings.push('Very short keyword patterns may cause false positives');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get the most restrictive action from multiple rule actions
 */
export function getMostRestrictiveAction(actions: RuleAction[]): RuleAction {
  if (actions.length === 0) {
    return 'LOG';
  }
  
  return actions.reduce((mostRestrictive, current) => {
    return RULE_ACTION_PRIORITY[current] > RULE_ACTION_PRIORITY[mostRestrictive]
      ? current
      : mostRestrictive;
  });
}

/**
 * Compare two rule actions and return the more restrictive one
 */
export function compareActions(a: RuleAction, b: RuleAction): RuleAction {
  return RULE_ACTION_PRIORITY[a] >= RULE_ACTION_PRIORITY[b] ? a : b;
}

/**
 * Update a rule and increment version
 */
export function updateRule(
  rule: DetectionRule, 
  updates: Partial<Omit<DetectionRule, 'id' | 'createdAt' | 'version'>>
): DetectionRule {
  return {
    ...rule,
    ...updates,
    version: rule.version + 1,
    updatedAt: new Date()
  };
}
