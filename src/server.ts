/**
 * TamengAI HTTP Server
 * Express server for the TamengAI security layer API
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';

import {
  createApiGateway,
  createPreFilter,
  createPostFilter,
  createDetectionEngine,
  createLoggingService,
  createConfigurationManager,
  FilterInputRequest,
  FilterOutputRequest,
  RequestContext
} from './index';
import { DetectionRule } from './types/detection';
import { 
  INDONESIAN_BLACKLIST_KEYWORDS, 
  INDONESIAN_JAILBREAK_PATTERNS,
  INDONESIAN_SARA_TERMS 
} from './detection/indonesian/keywords';

// Create default detection rules from Indonesian keywords
function createDefaultRules(): DetectionRule[] {
  const rules: DetectionRule[] = [];
  const now = new Date();

  // Blacklist keywords rule
  rules.push({
    id: 'indonesian-blacklist',
    name: 'Indonesian Blacklist Keywords',
    pattern: INDONESIAN_BLACKLIST_KEYWORDS.join('|'),
    type: 'KEYWORD',
    action: 'BLOCK',
    severity: 'HIGH',
    language: 'ID',
    enabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  // Jailbreak patterns rule
  rules.push({
    id: 'indonesian-jailbreak',
    name: 'Indonesian Jailbreak Patterns',
    pattern: INDONESIAN_JAILBREAK_PATTERNS.join('|'),
    type: 'JAILBREAK',
    action: 'BLOCK',
    severity: 'CRITICAL',
    language: 'ID',
    enabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  // SARA terms rule
  rules.push({
    id: 'indonesian-sara',
    name: 'Indonesian SARA Terms',
    pattern: INDONESIAN_SARA_TERMS.join('|'),
    type: 'SARA',
    action: 'FLAG',
    severity: 'MEDIUM',
    language: 'ID',
    enabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  return rules;
}

// Initialize components
const detectionEngine = createDetectionEngine(createDefaultRules());
const preFilter = createPreFilter(detectionEngine);
const postFilter = createPostFilter(detectionEngine);
const loggingService = createLoggingService();
const configManager = createConfigurationManager({}, detectionEngine);

// Initialize API Gateway
const gateway = createApiGateway({
  enableAuth: process.env.ENABLE_AUTH !== 'false',
  enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
  rateLimitConfig: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
  }
});

gateway.setPreFilter(preFilter);
gateway.setPostFilter(postFilter);
gateway.setDetectionEngine(detectionEngine);
gateway.setLoggingService(loggingService);
gateway.setConfigManager(configManager);

// Create Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  next();
});

// Build request context from Express request
function buildContext(req: Request): RequestContext {
  return {
    requestId: req.headers['x-request-id'] as string || uuidv4(),
    authHeader: req.headers.authorization,
    clientIp: req.ip || req.socket.remoteAddress || '0.0.0.0',
    userAgent: req.headers['user-agent'] || 'unknown'
  };
}

// Routes

/**
 * POST /api/v1/filter/input
 * Pre-filter endpoint - analyzes user prompts before sending to LLM
 */
app.post('/api/v1/filter/input', async (req: Request, res: Response) => {
  const context = buildContext(req);
  const body: FilterInputRequest = req.body;
  
  const result = await gateway.filterInput(body, context);
  
  if (!result.success && 'error' in result) {
    const statusCode = parseInt(result.error.code, 10) || 500;
    return res.status(statusCode).json(result);
  }
  
  res.json(result);
});

/**
 * POST /api/v1/filter/output
 * Post-filter endpoint - analyzes LLM outputs before sending to user
 */
app.post('/api/v1/filter/output', async (req: Request, res: Response) => {
  const context = buildContext(req);
  const body: FilterOutputRequest = req.body;
  
  const result = await gateway.filterOutput(body, context);
  
  if (!result.success && 'error' in result) {
    const statusCode = parseInt(result.error.code, 10) || 500;
    return res.status(statusCode).json(result);
  }
  
  res.json(result);
});

/**
 * GET /api/v1/health
 * Health check endpoint
 */
app.get('/api/v1/health', async (_req: Request, res: Response) => {
  const health = await gateway.healthCheck();
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /
 * Root endpoint - API info
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'TamengAI',
    version: '1.0.0',
    description: 'LLM Security & Safety Layer',
    endpoints: {
      filterInput: 'POST /api/v1/filter/input',
      filterOutput: 'POST /api/v1/filter/output',
      health: 'GET /api/v1/health'
    }
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: '500',
      message: 'Internal server error'
    },
    requestId: uuidv4(),
    timestamp: new Date()
  });
});

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                      TamengAI Server                       ║
║            LLM Security & Safety Layer                     ║
╠════════════════════════════════════════════════════════════╣
║  Server running at http://${HOST}:${PORT}                       ║
║                                                            ║
║  Endpoints:                                                ║
║    POST /api/v1/filter/input  - Pre-filter prompts         ║
║    POST /api/v1/filter/output - Post-filter LLM outputs    ║
║    GET  /api/v1/health        - Health check               ║
║                                                            ║
║  Auth: ${gateway.getAuthMiddleware() ? 'Enabled' : 'Disabled'}                                           ║
║  Rate Limit: ${gateway.getRateLimiter() ? 'Enabled' : 'Disabled'}                                      ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export { app, gateway };
