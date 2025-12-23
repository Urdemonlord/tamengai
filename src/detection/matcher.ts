/**
 * Pattern matching functions for detection rules
 */

import { DetectionRule, RuleMatch, RuleType } from '../types';

/**
 * Match a keyword in text (case-insensitive)
 */
export function matchKeyword(text: string, keyword: string): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  
  let position = 0;
  while ((position = lowerText.indexOf(lowerKeyword, position)) !== -1) {
    matches.push({
      ruleId: '',  // Will be set by caller
      ruleName: '',
      matchedText: text.substring(position, position + keyword.length),
      position,
      confidence: 1.0
    });
    position += 1;  // Move forward to find overlapping matches
  }
  
  return matches;
}

/**
 * Match a regex pattern in text
 */
export function matchPattern(text: string, pattern: string): RuleMatch[] {
  const matches: RuleMatch[] = [];
  
  try {
    const regex = new RegExp(pattern, 'gi');
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        ruleId: '',
        ruleName: '',
        matchedText: match[0],
        position: match.index,
        confidence: 1.0
      });
      
      // Prevent infinite loop for zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  } catch {
    // Invalid regex, return no matches
  }
  
  return matches;
}

/** Common injection signatures */
const INJECTION_SIGNATURES = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an)?\s*\w+/i,
  /pretend\s+(you\s+are|to\s+be)\s+/i,
  /act\s+as\s+(if\s+you\s+are\s+)?/i,
  /new\s+instructions?:/i,
  /system\s*:\s*/i,
  /\[system\]/i,
  /\{\{.*\}\}/i,  // Template injection
  /<\|.*\|>/i,    // Special token injection
];

/**
 * Detect injection signatures in text
 */
export function matchInjection(text: string): RuleMatch[] {
  const matches: RuleMatch[] = [];
  
  for (const signature of INJECTION_SIGNATURES) {
    const match = signature.exec(text);
    if (match) {
      matches.push({
        ruleId: 'injection-signature',
        ruleName: 'Injection Signature',
        matchedText: match[0],
        position: match.index,
        confidence: 0.9
      });
    }
  }
  
  return matches;
}

/** Common jailbreak patterns */
const JAILBREAK_PATTERNS = [
  /DAN\s*(mode|prompt)?/i,
  /do\s+anything\s+now/i,
  /jailbreak/i,
  /bypass\s+(safety|filter|restriction)/i,
  /ignore\s+(safety|ethical|moral)\s+(guidelines?|rules?|restrictions?)/i,
  /no\s+(restrictions?|limitations?|boundaries)/i,
  /unrestricted\s+mode/i,
  /developer\s+mode/i,
  /god\s+mode/i,
  /sudo\s+mode/i,
  /admin\s+mode/i,
  /unlock\s+(all\s+)?(capabilities|features|restrictions)/i,
  /remove\s+(all\s+)?(filters?|restrictions?|limitations?)/i,
  /disable\s+(safety|content)\s+(filters?|checks?)/i,
];

/**
 * Detect jailbreak patterns in text
 */
export function matchJailbreak(text: string): RuleMatch[] {
  const matches: RuleMatch[] = [];
  
  for (const pattern of JAILBREAK_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      matches.push({
        ruleId: 'jailbreak-pattern',
        ruleName: 'Jailbreak Pattern',
        matchedText: match[0],
        position: match.index,
        confidence: 0.85
      });
    }
  }
  
  return matches;
}

/**
 * Apply a detection rule to text and return matches
 */
export function applyRule(rule: DetectionRule, text: string): RuleMatch[] {
  if (!rule.enabled) {
    return [];
  }

  let matches: RuleMatch[];

  switch (rule.type) {
    case 'KEYWORD':
      matches = matchKeyword(text, rule.pattern);
      break;
    case 'PATTERN':
      matches = matchPattern(text, rule.pattern);
      break;
    case 'INJECTION':
      // Use both custom pattern and built-in signatures
      matches = [
        ...matchPattern(text, rule.pattern),
        ...matchInjection(text)
      ];
      break;
    case 'JAILBREAK':
      // Use both custom pattern and built-in patterns
      matches = [
        ...matchPattern(text, rule.pattern),
        ...matchJailbreak(text)
      ];
      break;
    case 'SARA':
    case 'HOAX':
    case 'MALWARE':
      // These use keyword or pattern matching
      matches = rule.pattern.startsWith('^') || rule.pattern.includes('(')
        ? matchPattern(text, rule.pattern)
        : matchKeyword(text, rule.pattern);
      break;
    default:
      matches = [];
  }

  // Set rule info on all matches
  return matches.map(m => ({
    ...m,
    ruleId: rule.id,
    ruleName: rule.name
  }));
}

/**
 * Apply multiple rules to text and return all matches
 */
export function applyRules(rules: DetectionRule[], text: string): RuleMatch[] {
  const allMatches: RuleMatch[] = [];
  
  for (const rule of rules) {
    const matches = applyRule(rule, text);
    allMatches.push(...matches);
  }
  
  return allMatches;
}

/**
 * Check if text contains any harmful content based on rules
 */
export function containsHarmfulContent(rules: DetectionRule[], text: string): boolean {
  for (const rule of rules) {
    if (rule.enabled && rule.action === 'BLOCK') {
      const matches = applyRule(rule, text);
      if (matches.length > 0) {
        return true;
      }
    }
  }
  return false;
}
