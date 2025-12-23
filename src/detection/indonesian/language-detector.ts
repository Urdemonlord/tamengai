/**
 * Language detection for Indonesian, English, and Mixed content
 */

import { DetectedLanguage } from '../../types/common';

/**
 * Common Indonesian words for language detection
 */
const INDONESIAN_MARKERS = [
  // Common words
  'dan', 'atau', 'yang', 'ini', 'itu', 'dengan', 'untuk', 'dari', 'ke', 'di',
  'pada', 'adalah', 'akan', 'sudah', 'belum', 'tidak', 'bukan', 'juga', 'saja',
  'hanya', 'bisa', 'dapat', 'harus', 'mau', 'ingin', 'perlu', 'boleh',
  // Pronouns
  'saya', 'aku', 'kamu', 'anda', 'dia', 'mereka', 'kita', 'kami',
  // Question words
  'apa', 'siapa', 'dimana', 'kapan', 'mengapa', 'kenapa', 'bagaimana', 'berapa',
  // Common verbs
  'membuat', 'melakukan', 'memberikan', 'menggunakan', 'mengatakan', 'melihat',
  'mendengar', 'mengetahui', 'membantu', 'mencari', 'menemukan',
  // Greetings
  'halo', 'selamat', 'terima kasih', 'tolong', 'maaf', 'permisi',
];

/**
 * Common English words for language detection
 */
const ENGLISH_MARKERS = [
  // Common words
  'the', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'can', 'may', 'might', 'must', 'shall',
  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  // Question words
  'what', 'who', 'where', 'when', 'why', 'how', 'which',
  // Common verbs
  'make', 'get', 'give', 'use', 'say', 'see', 'hear', 'know', 'help', 'find',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'about', 'into',
];

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Count marker words in text
 */
function countMarkers(words: string[], markers: string[]): number {
  const markerSet = new Set(markers);
  return words.filter(word => markerSet.has(word)).length;
}

/**
 * Detect the language of the given text
 */
export function detectLanguage(text: string): DetectedLanguage {
  const words = tokenize(text);
  
  if (words.length === 0) {
    return 'EN';  // Default to English for empty text
  }

  const indonesianCount = countMarkers(words, INDONESIAN_MARKERS);
  const englishCount = countMarkers(words, ENGLISH_MARKERS);
  
  const totalMarkers = indonesianCount + englishCount;
  
  if (totalMarkers === 0) {
    // No clear markers, check for Indonesian-specific characters/patterns
    if (hasIndonesianPatterns(text)) {
      return 'ID';
    }
    return 'EN';  // Default to English
  }

  const indonesianRatio = indonesianCount / totalMarkers;
  const englishRatio = englishCount / totalMarkers;

  // If both languages are significantly present, it's mixed
  if (indonesianRatio > 0.2 && englishRatio > 0.2) {
    return 'MIXED';
  }

  // Determine dominant language
  if (indonesianRatio > englishRatio) {
    return 'ID';
  }
  
  return 'EN';
}

/**
 * Check for Indonesian-specific patterns
 */
function hasIndonesianPatterns(text: string): boolean {
  const indonesianPatterns = [
    /\bnya\b/i,      // Common suffix
    /\bkan\b/i,      // Common suffix
    /\blah\b/i,      // Particle
    /\bpun\b/i,      // Particle
    /\bkah\b/i,      // Question particle
    /\bme\w+kan\b/i, // Verb prefix-suffix pattern
    /\bdi\w+kan\b/i, // Passive verb pattern
    /\bber\w+\b/i,   // Verb prefix
    /\bter\w+\b/i,   // Verb prefix
    /\bpe\w+an\b/i,  // Noun pattern
    /\bke\w+an\b/i,  // Noun pattern
  ];

  return indonesianPatterns.some(pattern => pattern.test(text));
}

/**
 * Get language confidence score
 */
export function getLanguageConfidence(text: string): { language: DetectedLanguage; confidence: number } {
  const words = tokenize(text);
  
  if (words.length === 0) {
    return { language: 'EN', confidence: 0.5 };
  }

  const indonesianCount = countMarkers(words, INDONESIAN_MARKERS);
  const englishCount = countMarkers(words, ENGLISH_MARKERS);
  const totalMarkers = indonesianCount + englishCount;

  if (totalMarkers === 0) {
    const hasIdPatterns = hasIndonesianPatterns(text);
    return {
      language: hasIdPatterns ? 'ID' : 'EN',
      confidence: hasIdPatterns ? 0.6 : 0.5
    };
  }

  const indonesianRatio = indonesianCount / totalMarkers;
  const englishRatio = englishCount / totalMarkers;

  if (indonesianRatio > 0.2 && englishRatio > 0.2) {
    return {
      language: 'MIXED',
      confidence: Math.min(indonesianRatio, englishRatio) * 2
    };
  }

  if (indonesianRatio > englishRatio) {
    return {
      language: 'ID',
      confidence: indonesianRatio
    };
  }

  return {
    language: 'EN',
    confidence: englishRatio
  };
}

/**
 * Check if text contains Indonesian content
 */
export function containsIndonesian(text: string): boolean {
  const result = detectLanguage(text);
  return result === 'ID' || result === 'MIXED';
}

/**
 * Check if text contains English content
 */
export function containsEnglish(text: string): boolean {
  const result = detectLanguage(text);
  return result === 'EN' || result === 'MIXED';
}
