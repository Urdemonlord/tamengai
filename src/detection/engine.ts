/**
 * Detection Engine - Core component for rule-based content analysis
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DetectionRule,
  DetectionResult,
  IDetectionEngine,
  RuleAction,
  RULE_ACTION_PRIORITY
} from '../types';
import { AnalysisContext, RuleMatch, ValidationResult, Language } from '../types/common';
import { applyRules } from './matcher';
import { validateRule, getMostRestrictiveAction } from './rule';
import { findIndonesianFuzzyMatches, FuzzyMatchConfig } from './indonesian/fuzzy-matcher';

/** Detection Engine configuration */
export interface DetectionEngineConfig {
  enableFuzzyMatching?: boolean;
  fuzzyMatchConfig?: Partial<FuzzyMatchConfig>;
}

const DEFAULT_CONFIG: DetectionEngineConfig = {
  enableFuzzyMatching: true,
  fuzzyMatchConfig: {
    threshold: 0.75,
    minWordLength: 3,
    maxWordLength: 50
  }
};

/**
 * In-memory Detection Engine implementation
 */
export class DetectionEngine implements IDetectionEngine {
  private rules: Map<string, DetectionRule> = new Map();
  private config: DetectionEngineConfig;

  constructor(initialRules?: DetectionRule[], config?: DetectionEngineConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (initialRules) {
      for (const rule of initialRules) {
        this.rules.set(rule.id, rule);
      }
    }
  }

  /**
   * Analyze input text (prompts) for harmful content
   * Implements Property 18: Fuzzy Matching for Indonesian Slang
   */
  async analyzeInput(text: string, context: AnalysisContext): Promise<DetectionResult> {
    const startTime = Date.now();
    
    // Get applicable rules based on language
    const applicableRules = this.getApplicableRules(context.language);
    
    // Apply all rules
    let matches = applyRules(applicableRules, text);
    
    // Apply fuzzy matching for Indonesian content (Property 18)
    if (this.config.enableFuzzyMatching && (context.language === 'ID' || context.language === 'MIXED')) {
      const fuzzyMatches = findIndonesianFuzzyMatches(text, this.config.fuzzyMatchConfig);
      matches = [...matches, ...fuzzyMatches];
    }
    
    // Determine recommended action based on matches
    const { recommendedAction, isHarmful } = this.determineAction(matches, applicableRules);
    
    // Calculate confidence
    const confidence = this.calculateConfidence(matches);
    
    return {
      isHarmful,
      matches,
      recommendedAction,
      confidence,
      processingTimeMs: Date.now() - startTime
    };
  }

  /**
   * Analyze output text (LLM responses) for harmful content
   */
  async analyzeOutput(text: string, context: AnalysisContext): Promise<DetectionResult> {
    // Same logic as input analysis
    return this.analyzeInput(text, context);
  }

  /**
   * Add a new detection rule
   */
  async addRule(rule: DetectionRule): Promise<void> {
    const validation = validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Update an existing rule
   */
  async updateRule(ruleId: string, updates: Partial<DetectionRule>): Promise<void> {
    const existing = this.rules.get(ruleId);
    if (!existing) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const updated: DetectionRule = {
      ...existing,
      ...updates,
      id: existing.id,  // Prevent ID change
      createdAt: existing.createdAt,  // Preserve creation date
      version: existing.version + 1,
      updatedAt: new Date()
    };

    const validation = validateRule(updated);
    if (!validation.valid) {
      throw new Error(`Invalid rule update: ${validation.errors.join(', ')}`);
    }

    this.rules.set(ruleId, updated);
  }

  /**
   * Remove a rule
   */
  async removeRule(ruleId: string): Promise<void> {
    if (!this.rules.has(ruleId)) {
      throw new Error(`Rule not found: ${ruleId}`);
    }
    this.rules.delete(ruleId);
  }

  /**
   * Get all rules
   */
  async getRules(): Promise<DetectionRule[]> {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific rule by ID
   */
  async getRule(ruleId: string): Promise<DetectionRule | null> {
    return this.rules.get(ruleId) ?? null;
  }

  /**
   * Validate a rule without adding it
   */
  validateRule(rule: Partial<DetectionRule>): ValidationResult {
    return validateRule(rule);
  }

  /**
   * Get rules applicable to a specific language
   */
  private getApplicableRules(language: 'ID' | 'EN' | 'MIXED'): DetectionRule[] {
    return Array.from(this.rules.values()).filter(rule => {
      if (!rule.enabled) return false;
      if (rule.language === 'BOTH') return true;
      if (language === 'MIXED') return true;
      return rule.language === language;
    });
  }

  /**
   * Determine the recommended action based on matches
   * Applies the most restrictive rule precedence
   */
  private determineAction(
    matches: RuleMatch[], 
    rules: DetectionRule[]
  ): { recommendedAction: 'PASS' | 'BLOCK' | 'FLAG'; isHarmful: boolean } {
    if (matches.length === 0) {
      return { recommendedAction: 'PASS', isHarmful: false };
    }

    // Get actions from matched rules
    const matchedRuleIds = new Set(matches.map(m => m.ruleId));
    const actions: RuleAction[] = [];

    for (const ruleId of matchedRuleIds) {
      const rule = rules.find(r => r.id === ruleId);
      if (rule) {
        actions.push(rule.action);
      }
    }

    // Handle built-in rules (injection, jailbreak)
    if (matches.some(m => m.ruleId === 'injection-signature' || m.ruleId === 'jailbreak-pattern')) {
      actions.push('BLOCK');
    }

    if (actions.length === 0) {
      return { recommendedAction: 'PASS', isHarmful: false };
    }

    // Get most restrictive action
    const mostRestrictive = getMostRestrictiveAction(actions);
    
    // LOG action means pass but log the event
    if (mostRestrictive === 'LOG') {
      return { recommendedAction: 'PASS', isHarmful: false };
    }
    
    return {
      recommendedAction: mostRestrictive,
      isHarmful: mostRestrictive === 'BLOCK' || mostRestrictive === 'FLAG'
    };
  }

  /**
   * Calculate confidence score based on matches
   */
  private calculateConfidence(matches: RuleMatch[]): number {
    if (matches.length === 0) {
      return 1.0;  // High confidence that content is safe
    }

    // Average confidence of all matches
    const avgConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;
    
    // Boost confidence with more matches
    const matchBoost = Math.min(matches.length * 0.05, 0.2);
    
    return Math.min(avgConfidence + matchBoost, 1.0);
  }
}

/**
 * Create a new Detection Engine instance
 */
export function createDetectionEngine(initialRules?: DetectionRule[]): IDetectionEngine {
  return new DetectionEngine(initialRules);
}
