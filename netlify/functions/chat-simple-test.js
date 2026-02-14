// Minimal chat function for testing - strips away all security layers
const https = require('https');

function callAnthropicAPI(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: message }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Anthropic API error: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { message } = JSON.parse(event.body);
    
    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message required' })
      };
    }

    console.log('[SIMPLE TEST] Calling Anthropic with:', message.substring(0, 50));
    
    const response = await callAnthropicAPI(message);
    const fullReply = response.content[0].text;
    
    // Generate summary: first 2 sentences
    const sentences = fullReply.split(/[.!?]+\s+/);
    const summary = sentences.slice(0, 2).join('. ').trim() + (sentences.length > 2 ? '...' : '');
    
    console.log('[SIMPLE TEST] Success, reply length:', fullReply.length);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        summary: summary,
        full: fullReply,
        test: true
      })
    };
    
  } catch (error) {
    console.error('[SIMPLE TEST] Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
