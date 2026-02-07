// Netlify Function: Chat API endpoint
// Handles message routing, rate limiting, and conversation storage

const crypto = require('crypto');

// In-memory storage (will be replaced with proper DB in production)
// For now using Netlify's execution context
let conversations = {};
let ipLimits = {};

// Clean up old data periodically (24 hours)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
const MAX_FREE_MESSAGES = 10;

// Helper: Get client IP
function getClientIP(headers) {
  return headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         headers['x-real-ip'] || 
         'unknown';
}

// Helper: Generate session ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// Helper: Check rate limit
function checkRateLimit(ip) {
  if (!ipLimits[ip]) {
    ipLimits[ip] = {
      count: 0,
      firstMessage: Date.now()
    };
  }
  
  const limit = ipLimits[ip];
  
  // Reset if older than 24 hours
  if (Date.now() - limit.firstMessage > CLEANUP_INTERVAL) {
    limit.count = 0;
    limit.firstMessage = Date.now();
  }
  
  return {
    remaining: Math.max(0, MAX_FREE_MESSAGES - limit.count),
    canSend: limit.count < MAX_FREE_MESSAGES
  };
}

// Helper: Record message
function recordMessage(ip) {
  if (!ipLimits[ip]) {
    ipLimits[ip] = {
      count: 0,
      firstMessage: Date.now()
    };
  }
  ipLimits[ip].count++;
}

// Simulated AI response (will be replaced with OpenClaw integration)
async function getMaxiResponse(message, sessionId) {
  // TODO: Integrate with OpenClaw gateway
  // For now, return a simulated response
  
  // Simulate thinking delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const responses = [
    "Bitcoin is the only truly decentralized digital asset with a capped supply of 21 million. It's not just digital gold—it's the foundation of economic sovereignty in the digital age.",
    "Treasury management requires understanding Bitcoin's unique properties: verifiable scarcity, censorship resistance, and global liquidity. Traditional assets can't compete with these fundamentals.",
    "The convergence of Bitcoin and AI isn't a trend—it's an inevitability. AI agents need uncensorable money to achieve true economic autonomy. Bitcoin provides that infrastructure.",
    "Corporate Bitcoin adoption is accelerating. Companies that understand Bitcoin as treasury infrastructure gain competitive advantage in capital preservation and global operations.",
    "Bitcoin's proof-of-work isn't wasteful—it's essential. Energy expenditure secures the network and ensures no central authority can manipulate supply or censor transactions."
  ];
  
  // Simple response selection based on message content
  if (message.toLowerCase().includes('treasury') || message.toLowerCase().includes('company')) {
    return responses[1];
  } else if (message.toLowerCase().includes('ai') || message.toLowerCase().includes('agent')) {
    return responses[2];
  } else if (message.toLowerCase().includes('corporate') || message.toLowerCase().includes('adoption')) {
    return responses[3];
  } else if (message.toLowerCase().includes('energy') || message.toLowerCase().includes('mining')) {
    return responses[4];
  }
  
  return responses[0];
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const body = JSON.parse(event.body);
    const { message, sessionId: clientSessionId } = body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message is required' })
      };
    }
    
    // Get client IP
    const clientIP = getClientIP(event.headers);
    
    // Check rate limit
    const rateLimit = checkRateLimit(clientIP);
    
    if (!rateLimit.canSend) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          error: 'Free message limit reached',
          limit: MAX_FREE_MESSAGES,
          remaining: 0,
          upgradeRequired: true,
          upgradeUrl: '/pricing'
        })
      };
    }
    
    // Generate or use existing session ID
    const sessionId = clientSessionId || generateSessionId();
    
    // Initialize conversation if needed
    if (!conversations[sessionId]) {
      conversations[sessionId] = {
        messages: [],
        createdAt: Date.now()
      };
    }
    
    // Add user message to conversation
    conversations[sessionId].messages.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    });
    
    // Get Maxi's response
    const response = await getMaxiResponse(message, sessionId);
    
    // Add assistant message to conversation
    conversations[sessionId].messages.push({
      role: 'assistant',
      content: response,
      timestamp: Date.now()
    });
    
    // Record message against rate limit
    recordMessage(clientIP);
    
    // Update rate limit info
    const updatedLimit = checkRateLimit(clientIP);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response,
        sessionId,
        messagesRemaining: updatedLimit.remaining,
        totalMessages: conversations[sessionId].messages.length,
        timestamp: Date.now()
      })
    };
    
  } catch (error) {
    console.error('Chat function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
