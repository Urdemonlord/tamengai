/**
 * API Gateway types
 */

/** Error response format */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    retryAfter?: number;
  };
  requestId: string;
  timestamp: Date;
}

/** Safe response format */
export interface SafeApiResponse {
  success: true;
  data: {
    message: string;
    type: 'BLOCKED' | 'FILTERED' | 'ERROR';
  };
  requestId: string;
  timestamp: Date;
}

/** Success response format */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
  timestamp: Date;
}

/** API response union type */
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse | SafeApiResponse;

/** Rate limit info */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

/** Authentication result */
export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  error?: string;
}

/** Health check response */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    preFilter: boolean;
    postFilter: boolean;
    detectionEngine: boolean;
    loggingService: boolean;
    configManager: boolean;
    llmJudge?: boolean;
  };
  timestamp: Date;
}
