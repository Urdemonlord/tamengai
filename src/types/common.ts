/**
 * Common types used across TamengAI components
 */

/** Supported languages for content analysis */
export type Language = 'ID' | 'EN' | 'BOTH';

/** Detected language in content */
export type DetectedLanguage = 'ID' | 'EN' | 'MIXED';

/** Client source types */
export type ClientSource = 'WEB' | 'MOBILE' | 'API';

/** Request metadata attached to every request */
export interface RequestMetadata {
  clientIp: string;
  userAgent: string;
  sessionId: string;
  language: DetectedLanguage;
  source: ClientSource;
}

/** Filter status for health checks */
export interface FilterStatus {
  healthy: boolean;
  lastProcessedAt: Date | null;
  averageLatencyMs: number;
  errorRate: number;
  rulesLoaded: number;
}

/** Validation result for rules and configuration */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Storage usage tracking */
export interface StorageUsage {
  totalBytes: number;
  usedBytes: number;
  percentUsed: number;
  oldestEntryDate: Date | null;
  entryCount: number;
}

/** Archive operation result */
export interface ArchiveResult {
  archivedCount: number;
  archivedBytes: number;
  archiveLocation: string;
  completedAt: Date;
}

/** Analysis context for detection engine */
export interface AnalysisContext {
  language: DetectedLanguage;
  previousMatches?: RuleMatch[];
  strictMode: boolean;
}

/** Rule match information */
export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  matchedText: string;
  position: number;
  confidence: number;
}
