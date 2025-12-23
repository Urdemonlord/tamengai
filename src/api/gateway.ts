/**
 * API Gateway - HTTP/REST endpoints for TamengAI
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ErrorResponse,
  SafeApiResponse,
  SuccessResponse,
  ApiResponse,
  HealthCheckResponse,
  AuthResult
} from '../types/api';
import {
  PreFilterRequest,
  PreFilterResponse,
  PostFilterRequest,
  PostFilterResponse,
  IPreFilter,
  IPostFilter
} from '../types';
import { RequestMetadata, Language } from '../types/common';
import { AuthMiddleware, createAuthMiddleware } from './middleware/auth';
import { RateLimiter, createRateLimiter, RateLimitConfig } from './middleware/rate-limiter';
import { ILoggingService } from '../types/logging';
import { IConfigurationManager } from '../types/config';
import { IDetectionEngine } from '../types/detection';

/** API Gateway configuration */
export interface ApiGatewayConfig {
  rateLimitConfig?: Partial<RateLimitConfig>;
  enableAuth?: boolean;
  enableRateLimit?: boolean;
}

/** Input filter request body */
export interface FilterInputRequest {
  prompt: string;
  userId?: string;
  metadata?: Partial<RequestMetadata>;
}

/** Output filter request body */
export interface FilterOutputRequest {
  originalPrompt: string;
  llmOutput: string;
  metadata?: Partial<RequestMetadata>;
}

/** Gateway request context */
export interface RequestContext {
  requestId: string;
  authHeader?: string;
  clientIp: string;
  userAgent: string;
}

/**
 * API Gateway implementation
 */
export class ApiGateway {
  private preFilter?: IPreFilter;
  private postFilter?: IPostFilter;
  private detectionEngine?: IDetectionEngine;
  private loggingService?: ILoggingService;
  private configManager?: IConfigurationManager;
  private authMiddleware: AuthMiddleware;
  private rateLimiter: RateLimiter;
  private config: ApiGatewayConfig;
  private llmAvailable: boolean = true;

  constructor(config?: ApiGatewayConfig) {
    this.config = {
      enableAuth: true,
      enableRateLimit: true,
      ...config
    };
    this.authMiddleware = createAuthMiddleware();
    this.rateLimiter = createRateLimiter(config?.rateLimitConfig);
  }

  /**
   * Set components
   */
  setPreFilter(filter: IPreFilter): void {
    this.preFilter = filter;
  }

  setPostFilter(filter: IPostFilter): void {
    this.postFilter = filter;
  }

  setDetectionEngine(engine: IDetectionEngine): void {
    this.detectionEngine = engine;
  }

  setLoggingService(service: ILoggingService): void {
    this.loggingService = service;
  }

  setConfigManager(manager: IConfigurationManager): void {
    this.configManager = manager;
  }

  setAuthMiddleware(middleware: AuthMiddleware): void {
    this.authMiddleware = middleware;
  }

  setRateLimiter(limiter: RateLimiter): void {
    this.rateLimiter = limiter;
  }

  /**
   * Set LLM availability status (for testing graceful degradation)
   */
  setLlmAvailable(available: boolean): void {
    this.llmAvailable = available;
  }

  /**
   * POST /api/v1/filter/input - Pre-filter endpoint
   */
  async filterInput(
    body: FilterInputRequest,
    context: RequestContext
  ): Promise<ApiResponse<PreFilterResponse>> {
    const { requestId } = context;

    // Property 13: Authentication Precedes Filtering
    if (this.config.enableAuth) {
      const authResult = await this.authMiddleware.authenticate(context.authHeader);
      if (!authResult.authenticated) {
        return this.createErrorResponse(requestId, '401', authResult.error || 'Unauthorized', 401);
      }
    }

    // Property 14: Rate Limit Enforcement
    if (this.config.enableRateLimit) {
      const rateLimitResult = this.rateLimiter.checkLimit(context.clientIp);
      if (!rateLimitResult.allowed) {
        return this.createErrorResponse(
          requestId,
          '429',
          'Rate limit exceeded',
          429,
          Math.ceil((rateLimitResult.retryAfterMs || 0) / 1000)
        );
      }
    }

    // Validate request body
    if (!body.prompt || typeof body.prompt !== 'string') {
      return this.createErrorResponse(requestId, '400', 'Missing or invalid prompt', 400);
    }

    // Check pre-filter availability
    if (!this.preFilter) {
      return this.createErrorResponse(requestId, '503', 'Pre-filter service unavailable', 503);
    }

    try {
      const preFilterRequest: PreFilterRequest = {
        requestId,
        prompt: body.prompt,
        userId: body.userId || 'anonymous',
        metadata: this.buildMetadata(body.metadata, context),
        timestamp: new Date()
      };

      const result = await this.preFilter.analyze(preFilterRequest);

      return {
        success: true,
        data: result,
        requestId,
        timestamp: new Date()
      };
    } catch (error) {
      return this.createErrorResponse(
        requestId,
        '500',
        'Internal server error',
        500
      );
    }
  }

  /**
   * POST /api/v1/filter/output - Post-filter endpoint
   */
  async filterOutput(
    body: FilterOutputRequest,
    context: RequestContext
  ): Promise<ApiResponse<PostFilterResponse>> {
    const { requestId } = context;

    // Property 13: Authentication Precedes Filtering
    if (this.config.enableAuth) {
      const authResult = await this.authMiddleware.authenticate(context.authHeader);
      if (!authResult.authenticated) {
        return this.createErrorResponse(requestId, '401', authResult.error || 'Unauthorized', 401);
      }
    }

    // Property 14: Rate Limit Enforcement
    if (this.config.enableRateLimit) {
      const rateLimitResult = this.rateLimiter.checkLimit(context.clientIp);
      if (!rateLimitResult.allowed) {
        return this.createErrorResponse(
          requestId,
          '429',
          'Rate limit exceeded',
          429,
          Math.ceil((rateLimitResult.retryAfterMs || 0) / 1000)
        );
      }
    }

    // Validate request body
    if (!body.llmOutput || typeof body.llmOutput !== 'string') {
      return this.createErrorResponse(requestId, '400', 'Missing or invalid llmOutput', 400);
    }

    // Property 15: Graceful LLM Unavailability Handling
    if (!this.llmAvailable) {
      return this.createGracefulErrorResponse(requestId);
    }

    // Check post-filter availability
    if (!this.postFilter) {
      return this.createErrorResponse(requestId, '503', 'Post-filter service unavailable', 503);
    }

    try {
      const postFilterRequest: PostFilterRequest = {
        requestId,
        originalPrompt: body.originalPrompt || '',
        llmOutput: body.llmOutput,
        metadata: this.buildMetadata(body.metadata, context),
        timestamp: new Date()
      };

      const result = await this.postFilter.analyze(postFilterRequest);

      return {
        success: true,
        data: result,
        requestId,
        timestamp: new Date()
      };
    } catch (error) {
      return this.createErrorResponse(
        requestId,
        '500',
        'Internal server error',
        500
      );
    }
  }

  /**
   * GET /api/v1/health - Health check endpoint
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return {
      status: this.determineHealthStatus(),
      components: {
        preFilter: this.preFilter?.getStatus().healthy ?? false,
        postFilter: this.postFilter?.getStatus().healthy ?? false,
        detectionEngine: !!this.detectionEngine,
        loggingService: !!this.loggingService,
        configManager: !!this.configManager,
        llmJudge: undefined
      },
      timestamp: new Date()
    };
  }

  /**
   * Get rate limiter for external access
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Get auth middleware for external access
   */
  getAuthMiddleware(): AuthMiddleware {
    return this.authMiddleware;
  }

  /**
   * Build request metadata
   */
  private buildMetadata(
    partial?: Partial<RequestMetadata>,
    context?: RequestContext
  ): RequestMetadata {
    return {
      clientIp: context?.clientIp || partial?.clientIp || '0.0.0.0',
      userAgent: context?.userAgent || partial?.userAgent || 'unknown',
      sessionId: partial?.sessionId || uuidv4(),
      language: partial?.language || 'ID',
      source: partial?.source || 'API'
    };
  }

  /**
   * Determine overall health status
   */
  private determineHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const preFilterHealthy = this.preFilter?.getStatus().healthy ?? false;
    const postFilterHealthy = this.postFilter?.getStatus().healthy ?? false;

    if (preFilterHealthy && postFilterHealthy) {
      return 'healthy';
    }
    if (preFilterHealthy || postFilterHealthy) {
      return 'degraded';
    }
    return 'unhealthy';
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    requestId: string,
    code: string,
    message: string,
    _httpStatus: number,
    retryAfter?: number
  ): ErrorResponse {
    return {
      success: false,
      error: {
        code,
        message,
        retryAfter
      },
      requestId,
      timestamp: new Date()
    };
  }

  /**
   * Create graceful error response for LLM unavailability
   * Property 15: Graceful LLM Unavailability Handling
   */
  private createGracefulErrorResponse(requestId: string): SafeApiResponse {
    return {
      success: true,
      data: {
        message: 'Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.',
        type: 'ERROR'
      },
      requestId,
      timestamp: new Date()
    };
  }
}

/**
 * Create API Gateway instance
 */
export function createApiGateway(config?: ApiGatewayConfig): ApiGateway {
  return new ApiGateway(config);
}
