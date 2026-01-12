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

## Integration Examples

TamengAI can be integrated as a security layer between your application and any LLM provider:

### Quick Integration (TypeScript/JavaScript)
```typescript
import axios from 'axios';

const TAMENGAI_URL = 'https://tamengai-production.up.railway.app';
const TAMENGAI_TOKEN = 'your-token';

async function secureChat(userPrompt: string) {
  // 1. Pre-filter user input
  const preFilter = await axios.post(
    `${TAMENGAI_URL}/api/v1/filter/input`,
    { prompt: userPrompt },
    { headers: { Authorization: `Bearer ${TAMENGAI_TOKEN}` } }
  );
  
  if (!preFilter.data.data.isAllowed) {
    return 'Prompt blocked: ' + preFilter.data.data.reason;
  }
  
  // 2. Call your LLM (OpenAI, Claude, etc.)
  const llmResponse = await callYourLLM(userPrompt);
  
  // 3. Post-filter LLM output
  const postFilter = await axios.post(
    `${TAMENGAI_URL}/api/v1/filter/output`,
    { originalPrompt: userPrompt, llmOutput: llmResponse },
    { headers: { Authorization: `Bearer ${TAMENGAI_TOKEN}` } }
  );
  
  if (!postFilter.data.data.isAllowed) {
    return postFilter.data.data.safeResponse;
  }
  
  return llmResponse;
}
```

### Python Integration
```python
import requests

class SecureLLMClient:
    def __init__(self, tamengai_url, token):
        self.url = tamengai_url
        self.headers = {'Authorization': f'Bearer {token}'}
    
    def secure_completion(self, prompt, llm_func):
        # Pre-filter
        pre_result = requests.post(
            f'{self.url}/api/v1/filter/input',
            json={'prompt': prompt},
            headers=self.headers
        ).json()
        
        if not pre_result['data']['isAllowed']:
            return f"Blocked: {pre_result['data']['reason']}"
        
        # Call LLM
        llm_output = llm_func(prompt)
        
        # Post-filter
        post_result = requests.post(
            f'{self.url}/api/v1/filter/output',
            json={'originalPrompt': prompt, 'llmOutput': llm_output},
            headers=self.headers
        ).json()
        
        if not post_result['data']['isAllowed']:
            return post_result['data'].get('safeResponse', 'Blocked')
        
        return llm_output
```

See [examples/](examples/) for complete integration examples with:
- OpenAI (`integration-openai.ts`)
- Anthropic Claude (`integration-anthropic.ts`)
- Python apps (`integration-python.py`)
- Next.js (`integration-nextjs.tsx`)

## License

MIT
