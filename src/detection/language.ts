/**
 * Language detection and fuzzy matching for TamengAI
 */

import { DetectedLanguage } from '../types/common';
import { 
  INDONESIAN_COMMON_WORDS, 
  ENGLISH_COMMON_WORDS,
  INDONESIAN_SLANG_VARIATIONS 
} from './indonesian';

/**
 * Detect the language of a text
 * Returns 'ID' for Indonesian, 'EN' for English, 'MIXED' for both
 */
export function detectLanguage(text: string): DetectedLanguage {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  
  let indonesianScore = 0;
  let englishScore = 0;
  
  for (const word of words) {
    if (INDONESIAN_COMMON_WORDS.includes(word)) {
      indonesianScore++;
    }
    if (ENGLISH_COMMON_WORDS.includes(word)) {
      englishScore++;
    }
  }
  
  const totalScore = indonesianScore + englishScore;
  
  if (totalScore === 0) {
    // Default to MIXED if no common words detected
    return 'MIXED';
  }
  
  const indonesianRatio = indonesianScore / totalScore;
  const englishRatio = englishScore / totalScore;
  
  // If both languages have significant presence, it's mixed
  if (indonesianRatio > 0.2 && englishRatio > 0.2) {
    return 'MIXED';
  }
  
  // Dominant language
  if (indonesianRatio > englishRatio) {
    return 'ID';
  }
  
  return 'EN';
}

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
 * Calculate similarity ratio between two strings (0 to 1)
 */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - (distance / maxLen);
}

/** Default similarity threshold for fuzzy matching */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.75;

/**
 * Check if a word matches any known slang variation using fuzzy matching
 */
export function matchSlangVariation(
  word: string, 
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): { matched: boolean; originalTerm?: string; matchedVariation?: string; similarity: number } {
  const lowerWord = word.toLowerCase();
  
  for (const [originalTerm, variations] of Object.entries(INDONESIAN_SLANG_VARIATIONS)) {
    // Check exact match with original term
    if (lowerWord === originalTerm) {
      return { matched: true, originalTerm, matchedVariation: originalTerm, similarity: 1.0 };
    }
    
    // Check exact match with variations
    for (const variation of variations) {
      if (lowerWord === variation.toLowerCase()) {
        return { matched: true, originalTerm, matchedVariation: variation, similarity: 1.0 };
      }
    }
    
    // Fuzzy match with original term
    const originalSimilarity = similarityRatio(lowerWord, originalTerm);
    if (originalSimilarity >= threshold) {
      return { matched: true, originalTerm, matchedVariation: originalTerm, similarity: originalSimilarity };
    }
    
    // Fuzzy match with variations
    for (const variation of variations) {
      const similarity = similarityRatio(lowerWord, variation);
      if (similarity >= threshold) {
        return { matched: true, originalTerm, matchedVariation: variation, similarity };
      }
    }
  }
  
  return { matched: false, similarity: 0 };
}

/**
 * Find all slang matches in a text
 */
export function findSlangMatches(
  text: string, 
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Array<{ word: string; originalTerm: string; matchedVariation: string; similarity: number; position: number }> {
  const matches: Array<{ word: string; originalTerm: string; matchedVariation: string; similarity: number; position: number }> = [];
  const words = text.split(/\s+/);
  let position = 0;
  
  for (const word of words) {
    const result = matchSlangVariation(word, threshold);
    if (result.matched && result.originalTerm && result.matchedVariation) {
      matches.push({
        word,
        originalTerm: result.originalTerm,
        matchedVariation: result.matchedVariation,
        similarity: result.similarity,
        position
      });
    }
    position += word.length + 1; // +1 for space
  }
  
  return matches;
}

/**
 * Analyze text for both Indonesian and English harmful content
 */
export function analyzeMultiLanguage(text: string): {
  language: DetectedLanguage;
  hasIndonesian: boolean;
  hasEnglish: boolean;
  indonesianWords: string[];
  englishWords: string[];
} {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  
  const indonesianWords: string[] = [];
  const englishWords: string[] = [];
  
  for (const word of words) {
    if (INDONESIAN_COMMON_WORDS.includes(word)) {
      indonesianWords.push(word);
    }
    if (ENGLISH_COMMON_WORDS.includes(word)) {
      englishWords.push(word);
    }
  }
  
  return {
    language: detectLanguage(text),
    hasIndonesian: indonesianWords.length > 0,
    hasEnglish: englishWords.length > 0,
    indonesianWords,
    englishWords
  };
}
