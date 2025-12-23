/**
 * Authentication Middleware - Validates auth tokens before processing
 */

import { AuthResult } from '../../types/api';

/** Token validation function type */
export type TokenValidator = (token: string) => Promise<AuthResult>;

/** Default token validator (for testing/demo) */
const defaultTokenValidator: TokenValidator = async (token: string): Promise<AuthResult> => {
  // Simple validation: token must be non-empty and start with 'Bearer '
  if (!token) {
    return { authenticated: false, error: 'Missing authentication token' };
  }
  
  if (!token.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Invalid token format' };
  }

  const actualToken = token.slice(7); // Remove 'Bearer ' prefix
  
  if (actualToken.length < 10) {
    return { authenticated: false, error: 'Invalid token' };
  }

  // Extract user ID from token (simplified - in production use JWT)
  const userId = `user_${actualToken.slice(0, 8)}`;
  
  return { authenticated: true, userId };
};

/**
 * Authentication middleware
 */
export class AuthMiddleware {
  private tokenValidator: TokenValidator;

  constructor(tokenValidator?: TokenValidator) {
    this.tokenValidator = tokenValidator ?? defaultTokenValidator;
  }

  /**
   * Authenticate a request
   * Property 13: Authentication Precedes Filtering
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
