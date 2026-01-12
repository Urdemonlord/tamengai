/**
 * Pre-filter component - Analyzes and filters user prompts before LLM
 * Implements prompt analysis pipeline with chained rule-based checks and latency enforcement
 */

import {
  PreFilterRequest,
  PreFilterResponse,
  PreFilterStatus,
  IPreFilter,
  IDetectionEngine,
  DetectionResult
} from '../types';
import { FilterStatus, RuleMatch, Language } from '../types/common';
import { detectLanguage } from '../detection/language';

/** Default max processing time in milliseconds */
const DEFAULT_MAX_PROCESSING_TIME_MS = 500;

/** Analysis pipeline stage result */
interface PipelineStageResult {
  stageName: string;
  passed: boolean;
  matches: RuleMatch[];
  durationMs: number;
}

/** Pipeline analysis result */
interface PipelineResult {
  stages: PipelineStageResult[];
  totalDurationMs: number;
  finalStatus: PreFilterStatus;
  allMatches: RuleMatch[];
}

/**
 * Pre-filter implementation with chained analysis pipeline
 */
export class PreFilter implements IPreFilter {
  private detectionEngine: IDetectionEngine;
  private maxProcessingTimeMs: number;
  private lastProcessedAt: Date | null = null;
  private totalProcessed: number = 0;
  private totalLatencyMs: number = 0;
  private errorCount: number = 0;
  private safeResponseMessage: string;
  private confidenceThreshold: number;

  constructor(
    detectionEngine: IDetectionEngine,
    options?: {
      maxProcessingTimeMs?: number;
      safeResponseMessage?: string;
      confidenceThreshold?: number;
    }
  ) {
    this.detectionEngine = detectionEngine;
    this.maxProcessingTimeMs = options?.maxProcessingTimeMs ?? DEFAULT_MAX_PROCESSING_TIME_MS;
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.7;
    this.safeResponseMessage = options?.safeResponseMessage ?? 
      'Maaf, permintaan Anda tidak dapat diproses karena melanggar kebijakan keamanan kami.';
  }

  /**
   * Analyze a prompt through the analysis pipeline
   * Implements Property 1: Pre-filter Latency Bound (< 500ms)
   * Implements Property 2: Pre-filter Blocks Harmful Prompts
   * Implements Property 3: Pre-filter Passes Safe Prompts
   */
  async analyze(request: PreFilterRequest): Promise<PreFilterResponse> {
    const startTime = Date.now();
    
    try {
      // Run the analysis pipeline with timeout enforcement
      const pipelineResult = await this.runPipelineWithTimeout(
        request.prompt,
        this.maxProcessingTimeMs
      );

      const processingTimeMs = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(processingTimeMs, false);

      // Build response based on pipeline result
      return this.buildResponse(request.requestId, pipelineResult, request.prompt);
      
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.updateMetrics(processingTimeMs, true);
      
      // On error or timeout, default to blocking for safety (Property 20)
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
   * Run the analysis pipeline with timeout enforcement
   */
  private async runPipelineWithTimeout(
    prompt: string,
    timeoutMs: number
  ): Promise<PipelineResult> {
    return new Promise(async (resolve, reject) => {
      // Set timeout handler
      const timeoutId = setTimeout(() => {
        // On timeout, return a blocking result (fail-safe)
        resolve({
          stages: [{
            stageName: 'timeout',
            passed: false,
            matches: [],
            durationMs: timeoutMs
          }],
          totalDurationMs: timeoutMs,
          finalStatus: 'BLOCK',
          allMatches: []
        });
      }, timeoutMs);

      try {
        const result = await this.runAnalysisPipeline(prompt);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Run the full analysis pipeline with chained stages
   * Pipeline stages:
   * 1. Language Detection
   * 2. Quick Keyword Check (fast path for obvious violations)
   * 3. Pattern Matching (regex-based detection)
   * 4. Injection Detection
   * 5. Jailbreak Detection
   * 6. Final Aggregation
   */
  private async runAnalysisPipeline(prompt: string): Promise<PipelineResult> {
    const stages: PipelineStageResult[] = [];
    const allMatches: RuleMatch[] = [];
    let totalDurationMs = 0;

    // Stage 1: Language Detection
    const langStart = Date.now();
    const language = detectLanguage(prompt);
    const langDuration = Date.now() - langStart;
    stages.push({
      stageName: 'language_detection',
      passed: true,
      matches: [],
      durationMs: langDuration
    });
    totalDurationMs += langDuration;

    // Stage 2: Full Detection Engine Analysis
    // This includes keyword, pattern, injection, and jailbreak detection
    const detectionStart = Date.now();
    const detectionResult = await this.detectionEngine.analyzeInput(prompt, {
      language,
      strictMode: false
    });
    const detectionDuration = Date.now() - detectionStart;
    
    stages.push({
      stageName: 'detection_engine',
      passed: !detectionResult.isHarmful,
      matches: detectionResult.matches,
      durationMs: detectionDuration
    });
    totalDurationMs += detectionDuration;
    allMatches.push(...detectionResult.matches);

    // Determine final status based on detection result and confidence
    let finalStatus: PreFilterStatus = 'PASS';
    
    if (detectionResult.isHarmful) {
      finalStatus = 'BLOCK';
    } else if (detectionResult.confidence < this.confidenceThreshold && allMatches.length > 0) {
      // Property 20: Uncertain Content Default to Safe
      finalStatus = 'BLOCK';
    }

    return {
      stages,
      totalDurationMs,
      finalStatus,
      allMatches
    };
  }

  /**
   * Build the response from pipeline result
   */
  private buildResponse(
    requestId: string,
    pipelineResult: PipelineResult,
    originalPrompt: string
  ): PreFilterResponse {
    const { finalStatus, allMatches, totalDurationMs } = pipelineResult;

    if (finalStatus === 'PASS') {
      return {
        requestId,
        status: 'PASS',
        filteredPrompt: originalPrompt,
        matchedRules: allMatches,
        processingTimeMs: totalDurationMs
      };
    }

    // Property 19: Safe Response Information Hiding
    // Property 21: Consolidated Violation Response
    return {
      requestId,
      status: 'BLOCK',
      safeResponse: this.safeResponseMessage,
      matchedRules: allMatches,
      processingTimeMs: totalDurationMs
    };
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
      rulesLoaded: 0 // Will be updated when we have access to rules count
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

  /**
   * Get max processing time configuration
   */
  getMaxProcessingTimeMs(): number {
    return this.maxProcessingTimeMs;
  }

  /**
   * Set max processing time (for testing)
   */
  setMaxProcessingTimeMs(ms: number): void {
    this.maxProcessingTimeMs = ms;
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
    confidenceThreshold?: number;
  }
): IPreFilter {
  return new PreFilter(detectionEngine, options);
}
