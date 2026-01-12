/**
 * TamengAI Integration with OpenAI
 * 
 * Example showing how to integrate TamengAI as a security layer
 * between your application and OpenAI API.
 */

import axios from 'axios';

// Configuration
const TAMENGAI_URL = 'https://tamengai-production.up.railway.app';
const TAMENGAI_TOKEN = process.env.TAMENGAI_TOKEN || 'your-token-here';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-key';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Secure chat completion with TamengAI pre and post filtering
 */
async function secureChatCompletion(userPrompt: string): Promise<string> {
  try {
    console.log('📝 User prompt:', userPrompt);
    
    // Step 1: Pre-filter - Check user input before sending to LLM
    console.log('🛡️ Step 1: Pre-filtering user input...');
    const preFilterResponse = await axios.post(
      `${TAMENGAI_URL}/api/v1/filter/input`,
      {
        prompt: userPrompt,
        metadata: {
          userId: 'user-123',
          sessionId: 'session-456'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TAMENGAI_TOKEN}`
        }
      }
    );

    // Check if prompt is allowed
    if (!preFilterResponse.data.data.isAllowed) {
      console.log('❌ Prompt blocked:', preFilterResponse.data.data.reason);
      return `Maaf, permintaan Anda tidak dapat diproses karena: ${preFilterResponse.data.data.reason}`;
    }

    console.log('✅ Pre-filter passed');

    // Step 2: Send to OpenAI
    console.log('🤖 Step 2: Calling OpenAI API...');
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    const llmOutput = openaiResponse.data.choices[0].message.content;
    console.log('✅ LLM response received');

    // Step 3: Post-filter - Check LLM output before sending to user
    console.log('🛡️ Step 3: Post-filtering LLM output...');
    const postFilterResponse = await axios.post(
      `${TAMENGAI_URL}/api/v1/filter/output`,
      {
        originalPrompt: userPrompt,
        llmOutput: llmOutput,
        metadata: {
          userId: 'user-123',
          sessionId: 'session-456'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TAMENGAI_TOKEN}`
        }
      }
    );

    // Check if output is allowed
    if (!postFilterResponse.data.data.isAllowed) {
      console.log('❌ Output blocked:', postFilterResponse.data.data.reason);
      return postFilterResponse.data.data.safeResponse || 
             'Maaf, respons tidak dapat ditampilkan karena mengandung konten yang tidak sesuai.';
    }

    console.log('✅ Post-filter passed');
    console.log('💬 Final response:', llmOutput);
    
    return llmOutput;

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example with streaming responses (for chat applications)
 */
async function secureChatWithStreaming(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void
): Promise<void> {
  const userPrompt = messages[messages.length - 1].content;

  // Pre-filter
  const preFilterResponse = await axios.post(
    `${TAMENGAI_URL}/api/v1/filter/input`,
    { prompt: userPrompt },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAMENGAI_TOKEN}`
      }
    }
  );

  if (!preFilterResponse.data.data.isAllowed) {
    onChunk(`Error: ${preFilterResponse.data.data.reason}`);
    return;
  }

  // Call OpenAI with streaming
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: messages,
      stream: true
    })
  });

  // Collect full response for post-filtering
  let fullResponse = '';
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content || '';
          fullResponse += content;
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  // Post-filter the complete response
  const postFilterResponse = await axios.post(
    `${TAMENGAI_URL}/api/v1/filter/output`,
    {
      originalPrompt: userPrompt,
      llmOutput: fullResponse
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAMENGAI_TOKEN}`
      }
    }
  );

  if (!postFilterResponse.data.data.isAllowed) {
    onChunk(postFilterResponse.data.data.safeResponse || 'Respons tidak dapat ditampilkan.');
  } else {
    onChunk(fullResponse);
  }
}

// Example usage
async function main() {
  console.log('🚀 TamengAI + OpenAI Integration Example\n');

  // Example 1: Safe prompt
  console.log('\n--- Example 1: Safe Prompt ---');
  const response1 = await secureChatCompletion('Apa itu kecerdasan buatan?');
  console.log('\nFinal Result:', response1);

  // Example 2: Harmful prompt (will be blocked)
  console.log('\n--- Example 2: Harmful Prompt ---');
  const response2 = await secureChatCompletion('Bagaimana cara membuat bom?');
  console.log('\nFinal Result:', response2);
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { secureChatCompletion, secureChatWithStreaming };
