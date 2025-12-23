/**
 * Fuzzy matching for Indonesian slang and informal language
 */

import { RuleMatch } from '../../types/common';
import { INDONESIAN_SLANG_MAPPINGS, getAllIndonesianKeywords } from './keywords';

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - distance / maxLen;
}

/**
 * Default similarity threshold for fuzzy matching
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.75;

/**
 * Configuration for fuzzy matching
 */
export interface FuzzyMatchConfig {
  threshold: number;
  minWordLength: number;
  maxWordLength: number;
}

const DEFAULT_CONFIG: FuzzyMatchConfig = {
  threshold: DEFAULT_SIMILARITY_THRESHOLD,
  minWordLength: 3,
  maxWordLength: 50
};

/**
 * Find fuzzy matches for a word against a list of target words
 */
export function findFuzzyMatches(
  word: string,
  targets: string[],
  config: Partial<FuzzyMatchConfig> = {}
): Array<{ target: string; similarity: number }> {
  const { threshold, minWordLength, maxWordLength } = { ...DEFAULT_CONFIG, ...config };
  
  if (word.length < minWordLength || word.length > maxWordLength) {
    return [];
  }

  const matches: Array<{ target: string; similarity: number }> = [];
  
  for (const target of targets) {
    const similarity = similarityRatio(word, target);
    if (similarity >= threshold) {
      matches.push({ target, similarity });
    }
  }

  // Sort by similarity descending
  return matches.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Check if a word is a slang variation of any harmful keyword
 */
export function isSlangVariation(
  word: string,
  config: Partial<FuzzyMatchConfig> = {}
): { isSlang: boolean; standardForm?: string; similarity?: number } {
  const lowerWord = word.toLowerCase();
  
  // First check exact slang mappings
  const exactMapping = INDONESIAN_SLANG_MAPPINGS[lowerWord];
  if (exactMapping) {
    return { isSlang: true, standardForm: exactMapping, similarity: 1.0 };
  }

  // Then check fuzzy matches against slang keys
  const slangKeys = Object.keys(INDONESIAN_SLANG_MAPPINGS);
  const fuzzyMatches = findFuzzyMatches(lowerWord, slangKeys, config);
  
  if (fuzzyMatches.length > 0) {
    const bestMatch = fuzzyMatches[0];
    return {
      isSlang: true,
      standardForm: INDONESIAN_SLANG_MAPPINGS[bestMatch.target],
      similarity: bestMatch.similarity
    };
  }

  return { isSlang: false };
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): Array<{ word: string; position: number }> {
  const tokens: Array<{ word: string; position: number }> = [];
  const regex = /\b\w+\b/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    tokens.push({ word: match[0], position: match.index });
  }
  
  return tokens;
}

/**
 * Find all fuzzy matches for Indonesian harmful content in text
 */
export function findIndonesianFuzzyMatches(
  text: string,
  config: Partial<FuzzyMatchConfig> = {}
): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const tokens = tokenize(text);
  const allKeywords = getAllIndonesianKeywords();
  const { threshold } = { ...DEFAULT_CONFIG, ...config };

  for (const { word, position } of tokens) {
    // Check slang variations
    const slangResult = isSlangVariation(word, config);
    if (slangResult.isSlang && slangResult.similarity && slangResult.similarity >= threshold) {
      matches.push({
        ruleId: 'indonesian-slang',
        ruleName: 'Indonesian Slang Detection',
        matchedText: word,
        position,
        confidence: slangResult.similarity
      });
      continue;
    }

    // Check fuzzy matches against all keywords
    const fuzzyMatches = findFuzzyMatches(word, allKeywords, config);
    if (fuzzyMatches.length > 0) {
      const bestMatch = fuzzyMatches[0];
      // Only add if it's not an exact match (exact matches handled elsewhere)
      if (bestMatch.similarity < 1.0) {
        matches.push({
          ruleId: 'indonesian-fuzzy',
          ruleName: 'Indonesian Fuzzy Match',
          matchedText: word,
          position,
          confidence: bestMatch.similarity
        });
      }
    }
  }

  return matches;
}

/**
 * Check if text contains Indonesian slang or fuzzy matches to harmful content
 */
export function containsIndonesianSlang(
  text: string,
  config: Partial<FuzzyMatchConfig> = {}
): boolean {
  const matches = findIndonesianFuzzyMatches(text, config);
  return matches.length > 0;
}
