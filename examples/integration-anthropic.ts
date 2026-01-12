/**
 * TamengAI Integration with Anthropic Claude
 * 
 * Example showing how to integrate TamengAI as a security layer
 * between your application and Anthropic Claude API.
 */

import axios from 'axios';

// Configuration
const TAMENGAI_URL = 'https://tamengai-production.up.railway.app';
const TAMENGAI_TOKEN = process.env.TAMENGAI_TOKEN || 'your-token-here';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'your-anthropic-key';

/**
 * Secure chat with Claude using TamengAI filtering
 */
async function secureChatWithClaude(userPrompt: string): Promise<string> {
  try {
    console.log('📝 User prompt:', userPrompt);
    
    // Step 1: Pre-filter user input
    console.log('🛡️ Pre-filtering...');
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
      return `Permintaan ditolak: ${preFilterResponse.data.data.reason}`;
    }

    // Step 2: Call Claude API
    console.log('🤖 Calling Claude...');
    const claudeResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    const llmOutput = claudeResponse.data.content[0].text;

    // Step 3: Post-filter LLM output
    console.log('🛡️ Post-filtering...');
    const postFilterResponse = await axios.post(
      `${TAMENGAI_URL}/api/v1/filter/output`,
      {
        originalPrompt: userPrompt,
        llmOutput: llmOutput
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TAMENGAI_TOKEN}`
        }
      }
    );

    if (!postFilterResponse.data.data.isAllowed) {
      return postFilterResponse.data.data.safeResponse || 
             'Respons tidak dapat ditampilkan.';
    }

    return llmOutput;

  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

export { secureChatWithClaude };
