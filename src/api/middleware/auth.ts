/**
 * Authentication Middleware - Validates API keys before processing
 */

import { AuthResult } from '../../types/api';
import { createHash, randomBytes } from 'crypto';

/** API Key configuration */
export interface ApiKeyConfig {
  /** Master API key (from environment) */
  masterKey?: string;
  /** Additional valid API keys */
  validKeys?: string[];
}

/** Token validation function type */
export type TokenValidator = (token: string) => Promise<AuthResult>;

/**
 * Generate a secure API key
 */
export function generateApiKey(prefix: string = 'tmg'): string {
  const randomPart = randomBytes(24).toString('base64url');
  return `${prefix}_${randomPart}`;
}

/**
 * Hash an API key for secure storage/comparison
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Create a token validator that checks against configured API keys
 */
export function createApiKeyValidator(config: ApiKeyConfig): TokenValidator {
  const validKeyHashes = new Set<string>();
  
  // Add master key if configured
  if (config.masterKey) {
    validKeyHashes.add(hashApiKey(config.masterKey));
  }
  
  // Add additional keys
  if (config.validKeys) {
    for (const key of config.validKeys) {
      validKeyHashes.add(hashApiKey(key));
    }
  }

  return async (authHeader: string): Promise<AuthResult> => {
    if (!authHeader) {
      return { authenticated: false, error: 'Missing authentication token' };
    }

    // Support both "Bearer <token>" and raw token
    let token = authHeader;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (!token || token.length < 10) {
      return { authenticated: false, error: 'Invalid token format' };
    }

    // Check if no keys are configured (allow any valid format token)
    if (validKeyHashes.size === 0) {
      // Fallback: accept any token with valid format for demo/testing
      const userId = `user_${token.slice(0, 8)}`;
      return { authenticated: true, userId };
    }

    // Validate against configured keys
    const tokenHash = hashApiKey(token);
    if (validKeyHashes.has(tokenHash)) {
      // Extract user ID from token prefix
      const userId = token.includes('_') ? token.split('_')[0] : 'api_user';
      return { authenticated: true, userId };
    }

    return { authenticated: false, error: 'Invalid API key' };
  };
}

/**
 * Authentication middleware
 */
export class AuthMiddleware {
  private tokenValidator: TokenValidator;

  constructor(tokenValidator?: TokenValidator) {
    // Default: use environment-based API key validation
    const masterKey = process.env.API_KEY || process.env.TAMENG_API_KEY;
    const additionalKeys = process.env.API_KEYS?.split(',').filter(k => k.trim());
    
    this.tokenValidator = tokenValidator ?? createApiKeyValidator({
      masterKey,
      validKeys: additionalKeys
    });
  }

  /**
   * Authenticate a request
   */
  async authenticate(authHeader?: string): Promise<AuthResult> {
    if (!authHeader) {
      return { authenticated: false, error: 'Missing authorization header' };
    }

    return this.tokenValidator(authHeader);
  }

  /**
   * Set custom token validator
   */
  setTokenValidator(validator: TokenValidator): void {
    this.tokenValidator = validator;
  }
}

/**
 * Create auth middleware instance
 */
export function createAuthMiddleware(tokenValidator?: TokenValidator): AuthMiddleware {
  return new AuthMiddleware(tokenValidator);
}
