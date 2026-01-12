# TamengAI Integration with Next.js

Complete guide to integrate TamengAI as a security layer in your Next.js application.

## 📋 Setup

1. Install dependencies:
```bash
npm install axios
```

2. Add environment variables to `.env.local`:
```env
TAMENGAI_URL=https://tamengai-production.up.railway.app
TAMENGAI_TOKEN=your-token-here
OPENAI_API_KEY=your-openai-key
```

## 🔧 Implementation

### 1. API Route: `app/api/chat/route.ts`

Create the secure chat API endpoint with pre-filter and post-filter:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const TAMENGAI_URL = process.env.TAMENGAI_URL || 'https://tamengai-production.up.railway.app';
const TAMENGAI_TOKEN = process.env.TAMENGAI_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { message, userId } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Step 1: Pre-filter user input
    const preFilterResponse = await axios.post(
      `${TAMENGAI_URL}/api/v1/filter/input`,
      {
        prompt: message,
        metadata: { userId }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TAMENGAI_TOKEN}`
        }
      }
    );

    // Block if not allowed
    if (!preFilterResponse.data.data.isAllowed) {
      return NextResponse.json({
        response: `Maaf, permintaan tidak dapat diproses: ${preFilterResponse.data.data.reason}`,
        blocked: true
      });
    }

    // Step 2: Call OpenAI
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: message }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    const llmOutput = openaiResponse.data.choices[0].message.content;

    // Step 3: Post-filter LLM output
    const postFilterResponse = await axios.post(
      `${TAMENGAI_URL}/api/v1/filter/output`,
      {
        originalPrompt: message,
        llmOutput: llmOutput,
        metadata: { userId }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TAMENGAI_TOKEN}`
        }
      }
    );

    // Use safe response if blocked
    if (!postFilterResponse.data.data.isAllowed) {
      return NextResponse.json({
        response: postFilterResponse.data.data.safeResponse || 
                 'Maaf, respons tidak dapat ditampilkan.',
        blocked: true
      });
    }

    return NextResponse.json({
      response: llmOutput,
      blocked: false
    });

  } catch (error: any) {
    console.error('Chat API Error:', error.response?.data || error.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Chat Component: `components/ChatBox.tsx`

```typescript
'use client';

import { useState } from 'react';

interface Message {
  role: string;
  content: string;
  blocked?: boolean;
}

export default function ChatBox() {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!message.trim()) return;

    // Add user message to chat
    const userMessage: Message = { role: 'user', content: message };
    setChat(prev => [...prev, userMessage]);
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          userId: 'user-123' // Replace with actual user ID
        })
      });

      const data = await response.json();

      // Add assistant response to chat
      setChat(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          blocked: data.blocked
        }
      ]);
    } catch (error) {
      console.error('Error:', error);
      setChat(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Terjadi kesalahan. Silakan coba lagi.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {chat.map((msg, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-100 ml-auto max-w-[80%]'
                : 'bg-gray-100 mr-auto max-w-[80%]'
            }`}
          >
            <p className="text-sm font-semibold mb-1">
              {msg.role === 'user' ? 'You' : 'AI'}
            </p>
            <p>{msg.content}</p>
            {msg.blocked && (
              <span className="text-xs text-red-600 mt-2 block">
                🛡️ Filtered by TamengAI
              </span>
            )}
          </div>
        ))}
        {loading && (
          <div className="bg-gray-100 p-4 rounded-lg mr-auto max-w-[80%]">
            <p className="text-sm">AI is typing...</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !message.trim()}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
        >
          Send
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2 text-center">
        Protected by TamengAI Security Layer
      </p>
    </div>
  );
}
```

### 3. Main Page: `app/page.tsx`

```typescript
import ChatBox from '@/components/ChatBox';

export default function Home() {
  return (
    <main>
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold mb-2">Secure AI Chat</h1>
        <p className="text-gray-600">Powered by TamengAI Security Layer</p>
      </div>
      <ChatBox />
    </main>
  );
}
```

## 🎯 How It Works

```
User Input → Pre-filter → OpenAI API → Post-filter → Display to User
                ↓                         ↓
           🛡️ Block harmful       🛡️ Block unsafe output
```

1. **Pre-filter**: Validates user input before sending to LLM
2. **LLM Call**: Sends safe prompts to OpenAI
3. **Post-filter**: Validates LLM response before showing to user
4. **Display**: Shows filtered content or safe response

## 🔒 Security Features

- ✅ Blocks harmful user inputs (violence, illegal activities, etc.)
- ✅ Filters unsafe LLM outputs
- ✅ Provides safe alternative responses
- ✅ Logs all interactions for audit
- ✅ Supports Indonesian language detection
- ✅ Rate limiting per user

## 📝 Testing

Test with safe prompt:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Apa itu AI?", "userId": "test-user"}'
```

Test with harmful prompt:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Cara membuat bom", "userId": "test-user"}'
```

The second request should be blocked by TamengAI's pre-filter.

## 🚀 Deployment

Deploy to Vercel:
```bash
vercel deploy
```

Make sure to add environment variables in Vercel dashboard:
- `TAMENGAI_URL`
- `TAMENGAI_TOKEN`
- `OPENAI_API_KEY`
