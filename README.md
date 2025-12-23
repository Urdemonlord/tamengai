# TamengAI - LLM Security & Safety Layer

External security layer for Large Language Models that functions as pre-filter and post-filter in the communication flow between users and LLM.

## Features

- **Pre-filter**: Analyzes user prompts before sending to LLM
- **Post-filter**: Analyzes LLM outputs before sending to user
- **Indonesian Language Support**: Detects harmful content in Indonesian including slang variations
- **Rate Limiting**: Configurable per-client rate limits
- **Authentication**: Token-based authentication middleware
- **Audit Logging**: Complete interaction logging for compliance

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Start server
npm start
```

### Docker Deployment

```bash
# Build image
docker build -t tamengai .

# Run container
docker run -d -p 3000:3000 --name tamengai tamengai
```

## API Endpoints

### POST /api/v1/filter/input
Pre-filter user prompts before sending to LLM.

```bash
curl -X POST http://localhost:3000/api/v1/filter/input \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"prompt": "Hello, how are you?"}'
```

### POST /api/v1/filter/output
Post-filter LLM outputs before sending to user.

```bash
curl -X POST http://localhost:3000/api/v1/filter/output \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"originalPrompt": "Hello", "llmOutput": "Hi there!"}'
```

### GET /api/v1/health
Health check endpoint.

```bash
curl http://localhost:3000/api/v1/health
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| HOST | 0.0.0.0 | Server host |
| ENABLE_AUTH | true | Enable authentication |
| ENABLE_RATE_LIMIT | true | Enable rate limiting |
| RATE_LIMIT_MAX | 100 | Max requests per window |
| RATE_LIMIT_WINDOW_MS | 60000 | Rate limit window (ms) |

## Architecture

```
Client → API Gateway → Pre-filter → LLM → Post-filter → Client
              ↓            ↓                   ↓
         Auth/Rate    Detection           Detection
          Limit        Engine              Engine
```

## License

MIT
