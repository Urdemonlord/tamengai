/**
 * Pre-filter component - Analyzes and filters user prompts before LLM
 */

import { v4 as uuidv4 } from 'uuid';
import {
  PreFilterRequest,
  PreFilterResponse,
  PreFilterStatus,
  IPreFilter,
  IDetectionEngine,
  DetectionResult
} from '../types';
import { FilterStatus, RuleMatch } from '../types/common';
import { detectLanguage } from '../detection/language';

/** Default max processing time in milliseconds */
const DEFAULT_MAX_PROCESSING_TIME_MS = 500;

/**
 * Pre-filter implementation
 */
export class PreFilter implements IPreFilter {
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
      'Maaf, permintaan Anda tidak dapat diproses karena melanggar kebijakan keamanan kami.';
  }

  /**
   * Analyze a prompt and determine if it should be blocked
   */
  async analyze(request: PreFilterRequest): Promise<PreFilterResponse> {
    const startTime = Date.now();
    
    try {
      // Detect language
      const language = detectLanguage(request.prompt);
      
      // Analyze with detection engine
      const result = await this.detectionEngine.analyzeInput(request.prompt, {
        language,
        strictMode: false
      });

      const processingTimeMs = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(processingTimeMs, false);

      // Determine status based on detection result
      const status: PreFilterStatus = result.isHarmful ? 'BLOCK' : 'PASS';

      return {
        requestId: request.requestId,
        status,
        filteredPrompt: status === 'PASS' ? request.prompt : undefined,
        safeResponse: status === 'BLOCK' ? this.safeResponseMessage : undefined,
        matchedRules: result.matches,
        processingTimeMs
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.updateMetrics(processingTimeMs, true);
      
      // On error, default to blocking for safety
      return {
        requestId: request.requestId,
        status: 'BLOCK',
        safeResponse: 'Terjadi kesalahan dalam memproses permintaan Anda. Silakan coba lagi.',
        matchedRules: [],
        processingTimeMs
      };
    }
  }

  /**
   * Get current filter status
   */
  getStatus(): FilterStatus {
    const rulesLoaded = 0; // Will be updated when we have access to rules count
    
    return {
      healthy: this.errorCount === 0 || (this.errorCount / Math.max(this.totalProcessed, 1)) < 0.1,
      lastProcessedAt: this.lastProcessedAt,
      averageLatencyMs: this.totalProcessed > 0 ? this.totalLatencyMs / this.totalProcessed : 0,
      errorRate: this.totalProcessed > 0 ? this.errorCount / this.totalProcessed : 0,
      rulesLoaded
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
 * Create a new PreFilter instance
 */
export function createPreFilter(
  detectionEngine: IDetectionEngine,
  options?: {
    maxProcessingTimeMs?: number;
    safeResponseMessage?: string;
  }
): IPreFilter {
  return new PreFilter(detectionEngine, options);
}
