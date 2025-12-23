/**
 * Post-filter component - Analyzes and filters LLM outputs before user
 */

import {
  PostFilterRequest,
  PostFilterResponse,
  PostFilterStatus,
  IPostFilter,
  IDetectionEngine
} from '../types';
import { FilterStatus } from '../types/common';
import { detectLanguage } from '../detection/language';

/** Default max processing time in milliseconds */
const DEFAULT_MAX_PROCESSING_TIME_MS = 500;

/**
 * Post-filter implementation
 */
export class PostFilter implements IPostFilter {
  private detectionEngine: IDetectionEngine;
  private maxProcessingTimeMs: number;
  private lastProcessedAt: Date | null = null;
  private totalProcessed: number = 0;
  private totalLatencyMs: number = 0;
  private errorCount: number = 0;
  private safeResponseMessage: string;

  constructor(
    detectionEngine: IDetectionEngine,
    options?: {
      maxProcessingTimeMs?: number;
      safeResponseMessage?: string;
    }
  ) {
    this.detectionEngine = detectionEngine;
    this.maxProcessingTimeMs = options?.maxProcessingTimeMs ?? DEFAULT_MAX_PROCESSING_TIME_MS;
    this.safeResponseMessage = options?.safeResponseMessage ?? 
      'Maaf, respons tidak dapat ditampilkan karena melanggar kebijakan konten kami.';
  }

  /**
   * Analyze LLM output and determine if it should be filtered
   */
  async analyze(request: PostFilterRequest): Promise<PostFilterResponse> {
    const startTime = Date.now();
    
    try {
      // Detect language
      const language = detectLanguage(request.llmOutput);
      
      // Analyze with detection engine
      const result = await this.detectionEngine.analyzeOutput(request.llmOutput, {
        language,
        strictMode: false
      });

      const processingTimeMs = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(processingTimeMs, false);

      // Determine status based on detection result
      const status: PostFilterStatus = result.isHarmful ? 'FILTER' : 'PASS';

      return {
        requestId: request.requestId,
        status,
        finalOutput: status === 'PASS' ? request.llmOutput : this.safeResponseMessage,
        matchedRules: result.matches,
        processingTimeMs
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.updateMetrics(processingTimeMs, true);
      
      // On error, default to filtering for safety
      return {
        requestId: request.requestId,
        status: 'FILTER',
        finalOutput: 'Terjadi kesalahan dalam memproses respons. Silakan coba lagi.',
        matchedRules: [],
        processingTimeMs
      };
    }
  }

  /**
   * Get current filter status
   */
  getStatus(): FilterStatus {
    return {
      healthy: this.errorCount === 0 || (this.errorCount / Math.max(this.totalProcessed, 1)) < 0.1,
      lastProcessedAt: this.lastProcessedAt,
      averageLatencyMs: this.totalProcessed > 0 ? this.totalLatencyMs / this.totalProcessed : 0,
      errorRate: this.totalProcessed > 0 ? this.errorCount / this.totalProcessed : 0,
      rulesLoaded: 0
    };
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(latencyMs: number, isError: boolean): void {
    this.lastProcessedAt = new Date();
    this.totalProcessed++;
    this.totalLatencyMs += latencyMs;
    if (isError) {
      this.errorCount++;
    }
  }
}

/**
 * Create a new PostFilter instance
 */
export function createPostFilter(
  detectionEngine: IDetectionEngine,
  options?: {
    maxProcessingTimeMs?: number;
    safeResponseMessage?: string;
  }
): IPostFilter {
  return new PostFilter(detectionEngine, options);
}
