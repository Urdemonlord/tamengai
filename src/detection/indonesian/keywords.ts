/**
 * Indonesian language keyword lists for content detection
 * 
 * Note: These are example keywords for demonstration purposes.
 * In production, these should be carefully curated and regularly updated.
 */

/**
 * Indonesian blacklist keywords - harmful/dangerous content
 */
export const INDONESIAN_BLACKLIST_KEYWORDS = [
  // Violence-related
  'bunuh',
  'membunuh',
  'pembunuhan',
  'mati',
  'racun',
  'meracuni',
  'senjata',
  'bom',
  'ledakan',
  'teror',
  'teroris',
  
  // Illegal activities
  'narkoba',
  'ganja',
  'sabu',
  'kokain',
  'heroin',
  'obat terlarang',
  'judi',
  'perjudian',
  'penipuan',
  'menipu',
  
  // Explicit content markers
  'pornografi',
  'porno',
  'cabul',
  'asusila',
  
  // Hacking/cybercrime
  'meretas',
  'hacking',
  'bobol',
  'membobol',
  'carding',
  'phishing',
];

/**
 * Indonesian SARA terms (Suku, Agama, Ras, Antar-golongan)
 * Terms that could be used in hate speech or discrimination
 */
export const INDONESIAN_SARA_TERMS = [
  // Ethnic slurs (examples - should be expanded carefully)
  'kafir',
  'murtad',
  'sesat',
  'bidah',
  
  // Discriminatory terms
  'rasis',
  'rasisme',
  'diskriminasi',
  'intoleran',
  'intoleransi',
  
  // Hate speech markers
  'benci',
  'kebencian',
  'ujaran kebencian',
  'provokasi',
  'hasut',
  'menghasut',
  'fitnah',
  'memfitnah',
];

/**
 * Indonesian jailbreak variations
 * Attempts to bypass AI safety in Indonesian
 */
export const INDONESIAN_JAILBREAK_PATTERNS = [
  // Direct translations of common jailbreak phrases
  'abaikan instruksi',
  'abaikan semua instruksi',
  'lupakan instruksi sebelumnya',
  'lupakan aturan',
  'tidak ada batasan',
  'tanpa batasan',
  'mode bebas',
  'mode tanpa sensor',
  'mode developer',
  'mode admin',
  'mode dewa',
  'berpura-pura menjadi',
  'anggap kamu adalah',
  'kamu sekarang adalah',
  'bertindak sebagai',
  'peran baru',
  'instruksi baru',
  'aturan baru',
  
  // Manipulation attempts
  'jangan ikuti aturan',
  'langgar aturan',
  'bypass filter',
  'lewati filter',
  'matikan filter',
  'nonaktifkan keamanan',
  'hapus pembatasan',
];

/**
 * Indonesian hoax/misinformation indicators
 */
export const INDONESIAN_HOAX_INDICATORS = [
  'hoax',
  'hoaks',
  'berita palsu',
  'informasi palsu',
  'kabar bohong',
  'tidak benar',
  'disinformasi',
  'misinformasi',
  'konspirasi',
  'teori konspirasi',
];

/**
 * Common Indonesian slang variations of harmful terms
 * Maps slang to standard form for fuzzy matching
 */
export const INDONESIAN_SLANG_MAPPINGS: Record<string, string> = {
  // Violence slang
  'bundir': 'bunuh diri',
  'gblk': 'goblok',
  'bngst': 'bangsat',
  'anjg': 'anjing',
  'ajg': 'anjing',
  'bgst': 'bangsat',
  'kntl': 'kontol',
  'mmk': 'memek',
  'jncok': 'jancok',
  'jnck': 'jancok',
  
  // Drug slang
  'gele': 'ganja',
  'cimeng': 'ganja',
  'putaw': 'heroin',
  'shabu': 'sabu',
  'inex': 'ekstasi',
  
  // Jailbreak slang
  'abaiin': 'abaikan',
  'lupain': 'lupakan',
  'gausah': 'tidak usah',
  'gausa': 'tidak usah',
};

/**
 * Get all Indonesian harmful keywords combined
 */
export function getAllIndonesianKeywords(): string[] {
  return [
    ...INDONESIAN_BLACKLIST_KEYWORDS,
    ...INDONESIAN_SARA_TERMS,
    ...INDONESIAN_JAILBREAK_PATTERNS,
    ...INDONESIAN_HOAX_INDICATORS,
    ...Object.keys(INDONESIAN_SLANG_MAPPINGS),
  ];
}

/**
 * Check if a term is Indonesian slang and get its standard form
 */
export function getStandardForm(slang: string): string | null {
  const lower = slang.toLowerCase();
  return INDONESIAN_SLANG_MAPPINGS[lower] ?? null;
}
