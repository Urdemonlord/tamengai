/**
 * Indonesian language support for TamengAI
 * Contains keyword lists, SARA terms, and jailbreak variations in Indonesian
 */

import { DetectionRule } from '../types';
import { createRule } from './rule';

/** Indonesian blacklist keywords (harmful/dangerous content) */
export const INDONESIAN_BLACKLIST_KEYWORDS = [
  // Violence
  'bunuh', 'membunuh', 'pembunuhan', 'bantai', 'pembantaian',
  'siksa', 'menyiksa', 'penyiksaan', 'hajar', 'menghajar',
  // Illegal activities
  'narkoba', 'ganja', 'sabu', 'ekstasi', 'heroin',
  'judi', 'perjudian', 'togel', 'slot online',
  'penipuan', 'menipu', 'tipu', 'scam',
  // Weapons
  'bom', 'merakit bom', 'senjata', 'pistol', 'senapan',
  // Hacking
  'hack', 'meretas', 'retas', 'bobol', 'membobol',
  'carding', 'phishing', 'malware', 'virus',
  // Exploitation
  'eksploitasi', 'perdagangan manusia', 'trafficking',
];

/** Indonesian SARA terms (Suku, Agama, Ras, Antar-golongan) */
export const INDONESIAN_SARA_TERMS = [
  // Ethnic slurs (censored/generalized)
  'cina', 'aseng', 'pribumi', 'non-pribumi',
  // Religious hate
  'kafir', 'murtad', 'sesat', 'bid\'ah',
  'kristenisasi', 'islamisasi', 'yahudi',
  // Racial terms
  'negro', 'nigger', 'ras inferior',
  // Inter-group conflict
  'komunis', 'pki', 'antek', 'kadrun', 'cebong', 'kampret',
  // Hate speech patterns
  'usir', 'basmi', 'musnahkan', 'hancurkan',
];

/** Indonesian jailbreak variations */
export const INDONESIAN_JAILBREAK_PATTERNS = [
  // Ignore instructions
  'abaikan instruksi', 'abaikan perintah', 'lupakan aturan',
  'jangan ikuti', 'tidak perlu ikuti',
  // Role play
  'berpura-pura', 'pura-pura jadi', 'berperan sebagai',
  'anggap dirimu', 'kamu sekarang adalah',
  // Bypass
  'lewati filter', 'bypass keamanan', 'tanpa batasan',
  'tanpa sensor', 'mode bebas', 'mode tanpa batas',
  // Developer mode
  'mode pengembang', 'mode developer', 'mode admin',
  'akses penuh', 'hak akses penuh',
];

/** Indonesian slang variations of harmful terms */
export const INDONESIAN_SLANG_VARIATIONS: Record<string, string[]> = {
  'bunuh': ['bunoh', 'bnuh', 'bunuhin', 'bunuhlah'],
  'narkoba': ['narkotik', 'drugs', 'obat terlarang', 'barang haram'],
  'hack': ['hek', 'hacking', 'ngehack', 'di-hack'],
  'judi': ['judol', 'jud1', 'gambling', 'taruhan'],
  'bom': ['b0m', 'boom', 'ledakan'],
  'penipuan': ['tipu2', 'nipu', 'scam', 'fraud'],
  'kafir': ['kapir', 'kfir', 'kafer'],
};

/** Common Indonesian words for language detection */
export const INDONESIAN_COMMON_WORDS = [
  'yang', 'dan', 'di', 'ini', 'itu', 'dengan', 'untuk', 'pada',
  'adalah', 'dari', 'dalam', 'tidak', 'akan', 'juga', 'sudah',
  'ke', 'bisa', 'ada', 'saya', 'kamu', 'dia', 'mereka', 'kami',
  'apa', 'siapa', 'dimana', 'kapan', 'mengapa', 'bagaimana',
  'tolong', 'mohon', 'terima kasih', 'maaf', 'permisi',
  'baik', 'buruk', 'besar', 'kecil', 'banyak', 'sedikit',
];

/** Common English words for language detection */
export const ENGLISH_COMMON_WORDS = [
  'the', 'and', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'with',
  'that', 'this', 'are', 'was', 'be', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may',
  'i', 'you', 'he', 'she', 'they', 'we', 'what', 'who', 'where',
  'when', 'why', 'how', 'please', 'thank', 'sorry', 'help',
];

/**
 * Create default Indonesian detection rules
 */
export function createIndonesianRules(): DetectionRule[] {
  const rules: DetectionRule[] = [];

  // Blacklist keyword rules
  for (const keyword of INDONESIAN_BLACKLIST_KEYWORDS) {
    rules.push(createRule({
      name: `ID Blacklist: ${keyword}`,
      type: 'KEYWORD',
      pattern: keyword,
      action: 'BLOCK',
      severity: 'HIGH',
      language: 'ID'
    }));
  }

  // SARA term rules
  for (const term of INDONESIAN_SARA_TERMS) {
    rules.push(createRule({
      name: `ID SARA: ${term}`,
      type: 'SARA',
      pattern: term,
      action: 'BLOCK',
      severity: 'CRITICAL',
      language: 'ID'
    }));
  }

  // Jailbreak pattern rules
  for (const pattern of INDONESIAN_JAILBREAK_PATTERNS) {
    rules.push(createRule({
      name: `ID Jailbreak: ${pattern}`,
      type: 'JAILBREAK',
      pattern: pattern,
      action: 'BLOCK',
      severity: 'HIGH',
      language: 'ID'
    }));
  }

  return rules;
}
