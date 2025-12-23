/**
 * LLM Judge types (optional semantic classification)
 */

import { DetectionResult } from './detection';

/** Context for LLM Judge classification */
export type JudgeContext = 'INPUT' | 'OUTPUT';

/** Classification result from LLM Judge */
export type JudgeClassification = 'SAFE' | 'UNSAFE' | 'UNCERTAIN';

/** LLM Judge request */
export interface LLMJudgeRequest {
  text: string;
  context: JudgeContext;
  previousAnalysis: DetectionResult;
}

/** LLM Judge response */
export interface LLMJudgeResponse {
  classification: JudgeClassification;
  confidence: number;
  reasoning: string;
  processingTimeMs: number;
}

/** LLM Judge interface */
export interface ILLMJudge {
  classify(request: LLMJudgeRequest): Promise<LLMJudgeResponse>;
  isEnabled(): boolean;
}
