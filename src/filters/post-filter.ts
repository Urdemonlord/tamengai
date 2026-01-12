/**
 * Post-filter component - Analyzes and filters LLM outputs before user
 * Implements output analysis pipeline with hoax, SARA, malware detection
 */

import {
  PostFilterRequest,
  PostFilterResponse,
  PostFilterStatus,
  IPostFilter,
  IDetectionEngine
} from '../types';
import { FilterStatus, RuleMatch, Language } from '../types/common';
import { detectLanguage } from '../detection/language';

/** Default max processing time in milliseconds */
const DEFAULT_MAX_PROCESSING_TIME_MS = 500;

/** Output content categories for detection */
type OutputCategory = 'HOAX' | 'SARA' | 'MALWARE' | 'ILLEGAL' | 'SAFE';

/** Analysis pipeline stage result */
interface PipelineStageResult {
  stageName: string;
  passed: boolean;
  matches: RuleMatch[];
  durationMs: number;
  category?: OutputCategory;
}

/** Pipeline analysis result */
interface PipelineResult {
  stages: PipelineStageResult[];
  totalDurationMs: number;
  finalStatus: PostFilterStatus;
  allMatches: RuleMatch[];
  detectedCategories: OutputCategory[];
}

/**
 * Post-filter implementation with output analysis pipeline
 */
export class PostFilter implements IPostFilter {
  private detectionEngine: IDetectionEngine;
  private maxProcessingTimeMs: number;
  private lastProcessedAt: Date | null = null;
  private totalProcessed: number = 0;
  private totalLatencyMs: number = 0;
  private errorCount: number = 0;
  private confidenceThreshold: number;
  
  // Safe response messages by category
  private safeResponses: Record<OutputCategory | 'DEFAULT', string> = {
    HOAX: 'Maaf, respons ini tidak dapat ditampilkan karena mengandung informasi yang belum terverifikasi.',
    SARA: 'Maaf, respons ini tidak dapat ditampilkan karena melanggar kebijakan konten terkait SARA.',
    MALWARE: 'Maaf, respons ini tidak dapat ditampilkan karena mengandung konten berbahaya.',
    ILLEGAL: 'Maaf, respons ini tidak dapat ditampilkan karena melanggar kebijakan konten.',
    SAFE: '',
    DEFAULT: 'Maaf, respons tidak dapat ditampilkan karena melanggar kebijakan konten kami.'
  };

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
    if (options?.safeResponseMessage) {
      this.safeResponses.DEFAULT = options.safeResponseMessage;
    }
  }

  /**
   * Analyze LLM output through the analysis pipeline
   * Implements Property 4: Post-filter Latency Bound (< 500ms)
   * Implements Property 5: Post-filter Blocks Harmful Outputs
   * Implements Property 6: Post-filter Passes Safe Outputs
   */
  async analyze(request: PostFilterRequest): Promise<PostFilterResponse> {
    const startTime = Date.now();
    
    try {
      // Run the analysis pipeline with timeout enforcement
      const pipelineResult = await this.runPipelineWithTimeout(
        request.llmOutput,
        request.originalPrompt,
        this.maxProcessingTimeMs
      );

      const processingTimeMs = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(processingTimeMs, false);

      // Build response based on pipeline result
      return this.buildResponse(request.requestId, pipelineResult, request.llmOutput);
      
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.updateMetrics(processingTimeMs, true);
      
      // On error or timeout, default to filtering for safety
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
   * Run the analysis pipeline with timeout enforcement
   */
  private async runPipelineWithTimeout(
    output: string,
    originalPrompt: string,
    timeoutMs: number
  ): Promise<PipelineResult> {
    return new Promise(async (resolve, reject) => {
      // Set timeout handler
      const timeoutId = setTimeout(() => {
        // On timeout, return a filtering result (fail-safe)
        resolve({
          stages: [{
            stageName: 'timeout',
            passed: false,
            matches: [],
            durationMs: timeoutMs
          }],
          totalDurationMs: timeoutMs,
          finalStatus: 'FILTER',
          allMatches: [],
          detectedCategories: []
        });
      }, timeoutMs);

      try {
        const result = await this.runAnalysisPipeline(output, originalPrompt);
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
   * 2. Hoax Detection
   * 3. SARA Content Detection
   * 4. Malware/Illegal Content Detection
   * 5. Final Aggregation
   */
  private async runAnalysisPipeline(
    output: string,
    originalPrompt: string
  ): Promise<PipelineResult> {
    const stages: PipelineStageResult[] = [];
    const allMatches: RuleMatch[] = [];
    const detectedCategories: OutputCategory[] = [];
    let totalDurationMs = 0;

    // Stage 1: Language Detection
    const langStart = Date.now();
    const language = detectLanguage(output);
    const langDuration = Date.now() - langStart;
    stages.push({
      stageName: 'language_detection',
      passed: true,
      matches: [],
      durationMs: langDuration
    });
    totalDurationMs += langDuration;

    // Stage 2: Full Detection Engine Analysis
    // This includes hoax, SARA, malware, and illegal content detection
    const detectionStart = Date.now();
    const detectionResult = await this.detectionEngine.analyzeOutput(output, {
      language,
      strictMode: false
    });
    const detectionDuration = Date.now() - detectionStart;
    
    // Categorize matches
    for (const match of detectionResult.matches) {
      const category = this.categorizeMatch(match);
      if (category !== 'SAFE' && !detectedCategories.includes(category)) {
        detectedCategories.push(category);
      }
    }

    stages.push({
      stageName: 'detection_engine',
      passed: !detectionResult.isHarmful,
      matches: detectionResult.matches,
      durationMs: detectionDuration
    });
    totalDurationMs += detectionDuration;
    allMatches.push(...detectionResult.matches);

    // Determine final status based on detection result and confidence
    let finalStatus: PostFilterStatus = 'PASS';
    
    if (detectionResult.isHarmful) {
      finalStatus = 'FILTER';
    } else if (detectionResult.confidence < this.confidenceThreshold && allMatches.length > 0) {
      // Property 20: Uncertain Content Default to Safe
      finalStatus = 'FILTER';
    }

    return {
      stages,
      totalDurationMs,
      finalStatus,
      allMatches,
      detectedCategories
    };
  }

  /**
   * Categorize a rule match into content category
   */
  private categorizeMatch(match: RuleMatch): OutputCategory {
    const ruleName = match.ruleName.toLowerCase();
    const ruleId = match.ruleId.toLowerCase();
    
    if (ruleName.includes('hoax') || ruleName.includes('hoaks') || ruleId.includes('hoax')) {
      return 'HOAX';
    }
    if (ruleName.includes('sara') || ruleId.includes('sara')) {
      return 'SARA';
    }
    if (ruleName.includes('malware') || ruleName.includes('virus') || ruleId.includes('malware')) {
      return 'MALWARE';
    }
    if (ruleName.includes('illegal') || ruleName.includes('blacklist') || ruleId.includes('illegal')) {
      return 'ILLEGAL';
    }
    
    return 'ILLEGAL'; // Default to illegal for unknown harmful content
  }

  /**
   * Build the response from pipeline result
   * Property 19: Safe Response Information Hiding
   * Property 21: Consolidated Violation Response
   */
  private buildResponse(
    requestId: string,
    pipelineResult: PipelineResult,
    originalOutput: string
  ): PostFilterResponse {
    const { finalStatus, allMatches, totalDurationMs, detectedCategories } = pipelineResult;

    if (finalStatus === 'PASS') {
      return {
        requestId,
        status: 'PASS',
        finalOutput: originalOutput,
        matchedRules: allMatches,
        processingTimeMs: totalDurationMs
      };
    }

    // Get appropriate safe response based on detected category
    // Property 21: Return single consolidated response even for multiple violations
    const safeResponse = this.getSafeResponse(detectedCategories);

    return {
      requestId,
      status: 'FILTER',
      finalOutput: safeResponse,
      matchedRules: allMatches,
      processingTimeMs: totalDurationMs
    };
  }

  /**
   * Get safe response message based on detected categories
   * Returns a single consolidated message (Property 21)
   */
  private getSafeResponse(categories: OutputCategory[]): string {
    // Priority order: MALWARE > ILLEGAL > SARA > HOAX
    if (categories.includes('MALWARE')) {
      return this.safeResponses.MALWARE;
    }
    if (categories.includes('ILLEGAL')) {
      return this.safeResponses.ILLEGAL;
    }
    if (categories.includes('SARA')) {
      return this.safeResponses.SARA;
    }
    if (categories.includes('HOAX')) {
      return this.safeResponses.HOAX;
    }
    return this.safeResponses.DEFAULT;
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
 * Create a new PostFilter instance
 */
export function createPostFilter(
  detectionEngine: IDetectionEngine,
  options?: {
    maxProcessingTimeMs?: number;
    safeResponseMessage?: string;
    confidenceThreshold?: number;
  }
): IPostFilter {
  return new PostFilter(detectionEngine, options);
}
