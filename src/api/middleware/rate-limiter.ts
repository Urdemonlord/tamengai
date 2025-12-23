/**
 * Rate Limiting Middleware - Enforces request rate limits per client
 */

import { RateLimitInfo } from '../../types/api';

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/** Client rate limit state */
interface ClientState {
  requests: number;
  windowStart: number;
}

/** Rate limit result */
export interface RateLimitResult {
  allowed: boolean;
  info: RateLimitInfo;
  retryAfterMs?: number;
}

/** Default rate limit config */
const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60000 // 1 minute
};

/**
 * Rate Limiter implementation
 * Property 14: Rate Limit Enforcement
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private clients: Map<string, ClientState> = new Map();

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a client is within rate limits
   */
  checkLimit(clientId: string): RateLimitResult {
    const now = Date.now();
    let state = this.clients.get(clientId);

    // Initialize or reset window if expired
    if (!state || now - state.windowStart >= this.config.windowMs) {
      state = { requests: 0, windowStart: now };
      this.clients.set(clientId, state);
    }

    // Calculate remaining time in window
    const windowEnd = state.windowStart + this.config.windowMs;
    const remaining = Math.max(0, this.config.maxRequests - state.requests);

    const info: RateLimitInfo = {
      limit: this.config.maxRequests,
      remaining,
      resetAt: new Date(windowEnd)
    };

    // Check if limit exceeded
    if (state.requests >= this.config.maxRequests) {
      const retryAfterMs = windowEnd - now;
      return {
        allowed: false,
        info: { ...info, remaining: 0 },
        retryAfterMs
      };
    }

    // Increment request count
    state.requests++;
    this.clients.set(clientId, state);

    return {
      allowed: true,
      info: { ...info, remaining: remaining - 1 }
    };
  }

  /**
   * Get current rate limit info for a client (without incrementing)
   */
  getInfo(clientId: string): RateLimitInfo {
    const now = Date.now();
    const state = this.clients.get(clientId);

    if (!state || now - state.windowStart >= this.config.windowMs) {
      return {
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        resetAt: new Date(now + this.config.windowMs)
      };
    }

    const windowEnd = state.windowStart + this.config.windowMs;
    return {
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - state.requests),
      resetAt: new Date(windowEnd)
    };
  }

  /**
   * Reset rate limit for a client
   */
  reset(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Clear all client states
   */
  clearAll(): void {
    this.clients.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }
}

/**
 * Create rate limiter instance
 */
export function createRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  return new RateLimiter(config);
}
