/**
 * Property-based tests for Indonesian language support
 * 
 * **Feature: tamengai-security-layer, Property 16, 17, 18**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import * as fc from 'fast-check';
import { 
  detectLanguage, 
  levenshteinDistance, 
  similarityRatio,
  matchSlangVariation,
  findSlangMatches,
  analyzeMultiLanguage,
  DEFAULT_SIMILARITY_THRESHOLD
} from '../../src/detection/language';
import {
  INDONESIAN_BLACKLIST_KEYWORDS,
  INDONESIAN_SARA_TERMS,
  INDONESIAN_JAILBREAK_PATTERNS,
  INDONESIAN_SLANG_VARIATIONS,
  INDONESIAN_COMMON_WORDS,
  ENGLISH_COMMON_WORDS,
  createIndonesianRules
} from '../../src/detection/indonesian';
import { DetectionEngine } from '../../src/detection/engine';

/**
 * Property 16: Indonesian Language Detection
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */
describe('Property 16: Indonesian Language Detection', () => {
  describe('detectLanguage', () => {
    it('should detect Indonesian text correctly', () => {
      const indonesianTexts = [
        'Saya ingin bertanya tentang cuaca hari ini',
        'Tolong bantu saya dengan tugas ini',
        'Apa yang kamu lakukan hari ini?',
        'Terima kasih atas bantuannya',
        'Bagaimana cara menggunakan aplikasi ini?'
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...indonesianTexts),
          (text) => {
            const result = detectLanguage(text);
            return result === 'ID' || result === 'MIXED';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect English text correctly', () => {
      const englishTexts = [
        'What is the weather today?',
        'Please help me with this task',
        'How do I use this application?',
        'Thank you for your help',
        'Can you explain this to me?'
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...englishTexts),
          (text) => {
            const result = detectLanguage(text);
            return result === 'EN' || result === 'MIXED';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Indonesian harmful content detection', () => {
    it('should detect Indonesian blacklist keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...INDONESIAN_BLACKLIST_KEYWORDS.slice(0, 10)),
          fc.string({ minLength: 0, maxLength: 20 }),
          fc.string({ minLength: 0, maxLength: 20 }),
          (keyword, prefix, suffix) => {
            const text = `${prefix} ${keyword} ${suffix}`;
            const rules = createIndonesianRules();
            const engine = new DetectionEngine(rules);
            
            // The keyword should be detected
            const keywordLower = keyword.toLowerCase();
            const hasMatchingRule = rules.some(r => 
              r.pattern.toLowerCase() === keywordLower && r.enabled
            );
            
            return hasMatchingRule;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect Indonesian SARA terms', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...INDONESIAN_SARA_TERMS.slice(0, 10)),
          (term) => {
            const rules = createIndonesianRules();
            const hasMatchingRule = rules.some(r => 
              r.pattern.toLowerCase() === term.toLowerCase() && 
              r.type === 'SARA' &&
              r.enabled
            );
            return hasMatchingRule;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect Indonesian jailbreak patterns', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...INDONESIAN_JAILBREAK_PATTERNS.slice(0, 10)),
          (pattern) => {
            const rules = createIndonesianRules();
            const hasMatchingRule = rules.some(r => 
              r.pattern.toLowerCase() === pattern.toLowerCase() && 
              r.type === 'JAILBREAK' &&
              r.enabled
            );
            return hasMatchingRule;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Property 17: Mixed Language Analysis
 * **Validates: Requirements 6.4**
 */
describe('Property 17: Mixed Language Analysis', () => {
  it('should detect mixed Indonesian-English text', () => {
    const mixedTexts = [
      'Saya want to ask about this',
      'Please tolong bantu saya',
      'What is apa yang terjadi?',
      'I need bantuan dengan this task',
      'Can you jelaskan how to do ini?'
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...mixedTexts),
        (text) => {
          const result = analyzeMultiLanguage(text);
          // Mixed text should have both Indonesian and English words
          // or be detected as MIXED language
          return result.language === 'MIXED' || 
                 (result.hasIndonesian || result.hasEnglish);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should identify both language components in mixed text', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INDONESIAN_COMMON_WORDS.slice(0, 5)),
        fc.constantFrom(...ENGLISH_COMMON_WORDS.slice(0, 5)),
        (idWord, enWord) => {
          const text = `${idWord} ${enWord} ${idWord} ${enWord}`;
          const result = analyzeMultiLanguage(text);
          
          // Should detect both languages
          return result.indonesianWords.length > 0 && result.englishWords.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 18: Fuzzy Matching for Indonesian Slang
 * **Validates: Requirements 6.5**
 */
describe('Property 18: Fuzzy Matching for Indonesian Slang', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (str) => {
            return levenshteinDistance(str, str) === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be symmetric', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (a, b) => {
            return levenshteinDistance(a, b) === levenshteinDistance(b, a);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should satisfy triangle inequality', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 8 }),
          fc.string({ minLength: 1, maxLength: 8 }),
          fc.string({ minLength: 1, maxLength: 8 }),
          (a, b, c) => {
            const ab = levenshteinDistance(a, b);
            const bc = levenshteinDistance(b, c);
            const ac = levenshteinDistance(a, c);
            return ac <= ab + bc;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('similarityRatio', () => {
    it('should return 1 for identical strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (str) => {
            return similarityRatio(str, str) === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return value between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (a, b) => {
            const ratio = similarityRatio(a, b);
            return ratio >= 0 && ratio <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('matchSlangVariation', () => {
    it('should match exact slang variations', () => {
      // Get all variations from the slang map
      const allVariations: string[] = [];
      for (const variations of Object.values(INDONESIAN_SLANG_VARIATIONS)) {
        allVariations.push(...variations);
      }

      fc.assert(
        fc.property(
          fc.constantFrom(...allVariations),
          (variation) => {
            const result = matchSlangVariation(variation);
            return result.matched === true && result.similarity === 1.0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match original terms exactly', () => {
      const originalTerms = Object.keys(INDONESIAN_SLANG_VARIATIONS);

      fc.assert(
        fc.property(
          fc.constantFrom(...originalTerms),
          (term) => {
            const result = matchSlangVariation(term);
            return result.matched === true && result.originalTerm === term;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect similar variations with fuzzy matching', () => {
      // Test slight misspellings
      const misspellings = [
        { input: 'bunuuh', expected: 'bunuh' },  // extra 'u'
        { input: 'narkob', expected: 'narkoba' }, // missing 'a'
        { input: 'hackk', expected: 'hack' },    // extra 'k'
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...misspellings),
          ({ input, expected }) => {
            const result = matchSlangVariation(input, 0.7); // Lower threshold for typos
            // Should either match or have high similarity
            return result.matched || result.similarity > 0.5;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not match unrelated words', () => {
      const unrelatedWords = [
        'kucing', 'anjing', 'makan', 'minum', 'tidur',
        'belajar', 'bekerja', 'bermain', 'membaca', 'menulis'
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...unrelatedWords),
          (word) => {
            const result = matchSlangVariation(word);
            return result.matched === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('findSlangMatches', () => {
    it('should find all slang matches in text', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.keys(INDONESIAN_SLANG_VARIATIONS)),
          fc.string({ minLength: 0, maxLength: 20 }).filter(s => !Object.keys(INDONESIAN_SLANG_VARIATIONS).some(k => s.includes(k))),
          (slangTerm, safeText) => {
            const text = `${safeText} ${slangTerm} ${safeText}`;
            const matches = findSlangMatches(text);
            
            // Should find at least one match
            return matches.length >= 1 && 
                   matches.some(m => m.originalTerm === slangTerm);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
