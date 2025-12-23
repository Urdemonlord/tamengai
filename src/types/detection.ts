/**
 * Detection Engine types
 */

import { AnalysisContext, Language, RuleMatch, ValidationResult } from './common';

/** Types of detection rules */
export type RuleType = 
  | 'KEYWORD' 
  | 'PATTERN' 
  | 'INJECTION' 
  | 'JAILBREAK' 
  | 'SARA' 
  | 'HOAX' 
  | 'MALWARE';

/** Actions to take when a rule matches */
export type RuleAction = 'BLOCK' | 'FLAG' | 'LOG';

/** Severity levels for rules */
export type RuleSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Detection rule definition */
export interface DetectionRule {
  id: string;
  name: string;
  type: RuleType;
  pattern: string;
  action: RuleAction;
  severity: RuleSeverity;
  language: Language;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of detection analysis */
export interface DetectionResult {
  isHarmful: boolean;
  matches: RuleMatch[];
  recommendedAction: 'PASS' | 'BLOCK' | 'FLAG';
  confidence: number;
  processingTimeMs: number;
}

/** Detection Engine interface */
export interface IDetectionEngine {
  analyzeInput(text: string, context: AnalysisContext): Promise<DetectionResult>;
  analyzeOutput(text: string, context: AnalysisContext): Promise<DetectionResult>;
  addRule(rule: DetectionRule): Promise<void>;
  updateRule(ruleId: string, updates: Partial<DetectionRule>): Promise<void>;
  removeRule(ruleId: string): Promise<void>;
  getRules(): Promise<DetectionRule[]>;
  getRule(ruleId: string): Promise<DetectionRule | null>;
  validateRule(rule: Partial<DetectionRule>): ValidationResult;
}

/** Rule action priority (higher = more restrictive) */
export const RULE_ACTION_PRIORITY: Record<RuleAction, number> = {
  BLOCK: 3,
  FLAG: 2,
  LOG: 1
};
