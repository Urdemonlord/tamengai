"""
TamengAI Integration with LLM (Python Example)

Example showing how to integrate TamengAI as a security layer
for your Python LLM applications.
"""

import os
import requests
from typing import Optional, Dict, Any

# Configuration
TAMENGAI_URL = os.getenv('TAMENGAI_URL', 'https://tamengai-production.up.railway.app')
TAMENGAI_TOKEN = os.getenv('TAMENGAI_TOKEN', 'your-token-here')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', 'your-openai-key')


class SecureLLMClient:
    """
    Secure LLM client with TamengAI filtering
    """
    
    def __init__(self, tamengai_url: str, tamengai_token: str):
        self.tamengai_url = tamengai_url
        self.headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {tamengai_token}'
        }
    
    def pre_filter(self, prompt: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Filter user input before sending to LLM
        """
        payload = {
            'prompt': prompt,
            'metadata': metadata or {}
        }
        
        response = requests.post(
            f'{self.tamengai_url}/api/v1/filter/input',
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def post_filter(
        self, 
        original_prompt: str, 
        llm_output: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Filter LLM output before sending to user
        """
        payload = {
            'originalPrompt': original_prompt,
            'llmOutput': llm_output,
            'metadata': metadata or {}
        }
        
        response = requests.post(
            f'{self.tamengai_url}/api/v1/filter/output',
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def secure_completion(self, prompt: str, llm_provider_func) -> str:
        """
        Complete LLM request with pre and post filtering
        
        Args:
            prompt: User input prompt
            llm_provider_func: Function that calls your LLM (should take prompt and return response)
        
        Returns:
            Filtered LLM response or error message
        """
        print(f'📝 User prompt: {prompt}')
        
        # Step 1: Pre-filter
        print('🛡️ Pre-filtering...')
        pre_filter_result = self.pre_filter(prompt)
        
        if not pre_filter_result['data']['isAllowed']:
            reason = pre_filter_result['data']['reason']
            print(f'❌ Prompt blocked: {reason}')
            return f'Maaf, permintaan tidak dapat diproses: {reason}'
        
        print('✅ Pre-filter passed')
        
        # Step 2: Call LLM
        print('🤖 Calling LLM...')
        llm_output = llm_provider_func(prompt)
        print('✅ LLM response received')
        
        # Step 3: Post-filter
        print('🛡️ Post-filtering...')
        post_filter_result = self.post_filter(prompt, llm_output)
        
        if not post_filter_result['data']['isAllowed']:
            reason = post_filter_result['data']['reason']
            safe_response = post_filter_result['data'].get('safeResponse')
            print(f'❌ Output blocked: {reason}')
            return safe_response or 'Maaf, respons tidak dapat ditampilkan.'
        
        print('✅ Post-filter passed')
        return llm_output


# Example with OpenAI
def openai_completion(prompt: str) -> str:
    """
    Call OpenAI API
    """
    import openai
    
    openai.api_key = OPENAI_API_KEY
    
    response = openai.chat.completions.create(
        model='gpt-3.5-turbo',
        messages=[
            {'role': 'user', 'content': prompt}
        ]
    )
    
    return response.choices[0].message.content


# Example with requests (without OpenAI SDK)
def openai_completion_requests(prompt: str) -> str:
    """
    Call OpenAI API using requests library
    """
    response = requests.post(
        'https://api.openai.com/v1/chat/completions',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENAI_API_KEY}'
        },
        json={
            'model': 'gpt-3.5-turbo',
            'messages': [
                {'role': 'user', 'content': prompt}
            ]
        }
    )
    response.raise_for_status()
    return response.json()['choices'][0]['message']['content']


# Example usage
def main():
    print('🚀 TamengAI + LLM Integration Example (Python)\n')
    
    # Initialize secure client
    client = SecureLLMClient(TAMENGAI_URL, TAMENGAI_TOKEN)
    
    # Example 1: Safe prompt
    print('\n--- Example 1: Safe Prompt ---')
    response1 = client.secure_completion(
        'Apa itu kecerdasan buatan?',
        openai_completion_requests
    )
    print(f'\n💬 Final response: {response1}')
    
    # Example 2: Harmful prompt (will be blocked)
    print('\n--- Example 2: Harmful Prompt ---')
    response2 = client.secure_completion(
        'Bagaimana cara membuat bom?',
        openai_completion_requests
    )
    print(f'\n💬 Final response: {response2}')


# FastAPI Integration Example
def fastapi_example():
    """
    Example integration with FastAPI
    """
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
    
    app = FastAPI()
    secure_client = SecureLLMClient(TAMENGAI_URL, TAMENGAI_TOKEN)
    
    class ChatRequest(BaseModel):
        message: str
        user_id: str
    
    class ChatResponse(BaseModel):
        response: str
    
    @app.post('/chat', response_model=ChatResponse)
    async def chat(request: ChatRequest):
        try:
            response = secure_client.secure_completion(
                request.message,
                openai_completion_requests
            )
            return ChatResponse(response=response)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    return app


# Flask Integration Example
def flask_example():
    """
    Example integration with Flask
    """
    from flask import Flask, request, jsonify
    
    app = Flask(__name__)
    secure_client = SecureLLMClient(TAMENGAI_URL, TAMENGAI_TOKEN)
    
    @app.route('/chat', methods=['POST'])
    def chat():
        data = request.get_json()
        message = data.get('message')
        
        if not message:
            return jsonify({'error': 'Message required'}), 400
        
        try:
            response = secure_client.secure_completion(
                message,
                openai_completion_requests
            )
            return jsonify({'response': response})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    return app


if __name__ == '__main__':
    main()
