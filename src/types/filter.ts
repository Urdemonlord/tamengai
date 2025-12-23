/**
 * Filter component types (Pre-filter and Post-filter)
 */

import { FilterStatus, RequestMetadata, RuleMatch } from './common';

/** Pre-filter request */
export interface PreFilterRequest {
  requestId: string;
  prompt: string;
  userId: string;
  metadata: RequestMetadata;
  timestamp: Date;
}

/** Pre-filter response status */
export type PreFilterStatus = 'PASS' | 'BLOCK';

/** Pre-filter response */
export interface PreFilterResponse {
  requestId: string;
  status: PreFilterStatus;
  filteredPrompt?: string;
  safeResponse?: string;
  matchedRules: RuleMatch[];
  processingTimeMs: number;
}

/** Pre-filter interface */
export interface IPreFilter {
  analyze(request: PreFilterRequest): Promise<PreFilterResponse>;
  getStatus(): FilterStatus;
}

/** Post-filter request */
export interface PostFilterRequest {
  requestId: string;
  originalPrompt: string;
  llmOutput: string;
  metadata: RequestMetadata;
  timestamp: Date;
}

/** Post-filter response status */
export type PostFilterStatus = 'PASS' | 'FILTER';

/** Post-filter response */
export interface PostFilterResponse {
  requestId: string;
  status: PostFilterStatus;
  finalOutput: string;
  matchedRules: RuleMatch[];
  processingTimeMs: number;
}

/** Post-filter interface */
export interface IPostFilter {
  analyze(request: PostFilterRequest): Promise<PostFilterResponse>;
  getStatus(): FilterStatus;
}
