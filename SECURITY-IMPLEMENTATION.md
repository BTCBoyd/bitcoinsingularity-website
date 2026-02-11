# Security Implementation Plan - Chat MVP

## Current Vulnerabilities (NOW PATCHED - SITE DOWN)

1. ❌ No authentication - anyone can call API
2. ❌ Session hijacking - sessionIds are guessable
3. ❌ Unlimited abuse - change IP/sessionId bypasses all limits
4. ❌ Metadata leakage - exposes internal details
5. ❌ Cost attack vector - could drain entire API budget

---

## Security Architecture (3 Layers)

### Layer 1: API Key Authentication (REQUIRED)
Every request must include a valid API key.

**Implementation:**
```javascript
// netlify/functions/chat-mvp.js
const crypto = require('crypto');

// Store valid API keys (in environment variables)
const VALID_API_KEYS = new Set(
  (process.env.CHAT_API_KEYS || '').split(',').filter(Boolean)
);

// Middleware to validate API key
function validateAPIKey(event) {
  const apiKey = event.headers['x-api-key'] || event.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return { statusCode: 401, body: JSON.stringify({ error: 'API key required' }) };
  }
  
  if (!VALID_API_KEYS.has(apiKey)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Invalid API key' }) };
  }
  
  return null; // Valid
}

exports.handler = async (event) => {
  // Validate API key first
  const authError = validateAPIKey(event);
  if (authError) return authError;
  
  // Rest of function logic...
};
```

**How to generate API keys:**
```bash
# Generate secure API keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Environment variable setup (Netlify):**
```
CHAT_API_KEYS=key1_abc123...,key2_def456...,key3_ghi789...
```

---

### Layer 2: Rate Limiting (Per API Key + IP)

**Implementation using Netlify Blobs (serverless storage):**

```javascript
const { getStore } = require('@netlify/blobs');

async function checkRateLimit(apiKey, ipAddress) {
  const store = getStore('rate-limits');
  const now = Date.now();
  const hour = 3600000; // 1 hour in ms
  const day = 86400000; // 24 hours in ms
  
  // Keys for tracking
  const hourlyKey = `${apiKey}:${Math.floor(now / hour)}`;
  const dailyKey = `${apiKey}:${Math.floor(now / day)}`;
  const ipHourlyKey = `ip:${ipAddress}:${Math.floor(now / hour)}`;
  
  // Get current counts
  const hourlyCount = parseInt(await store.get(hourlyKey) || '0');
  const dailyCount = parseInt(await store.get(dailyKey) || '0');
  const ipHourlyCount = parseInt(await store.get(ipHourlyKey) || '0');
  
  // Limits
  const HOURLY_LIMIT = 15;
  const DAILY_LIMIT = 50;
  const IP_HOURLY_LIMIT = 20; // Prevent IP rotation abuse
  
  // Check limits
  if (hourlyCount >= HOURLY_LIMIT) {
    return { 
      allowed: false, 
      error: 'Hourly limit exceeded (15 requests/hour)',
      resetInMs: hour - (now % hour)
    };
  }
  
  if (dailyCount >= DAILY_LIMIT) {
    return { 
      allowed: false, 
      error: 'Daily limit exceeded (50 requests/day)',
      resetInMs: day - (now % day)
    };
  }
  
  if (ipHourlyCount >= IP_HOURLY_LIMIT) {
    return { 
      allowed: false, 
      error: 'IP rate limit exceeded (20 requests/hour per IP)',
      resetInMs: hour - (now % hour)
    };
  }
  
  // Increment counts
  await store.set(hourlyKey, String(hourlyCount + 1), { ttl: hour / 1000 });
  await store.set(dailyKey, String(dailyCount + 1), { ttl: day / 1000 });
  await store.set(ipHourlyKey, String(ipHourlyCount + 1), { ttl: hour / 1000 });
  
  return { 
    allowed: true,
    remaining: {
      hourly: HOURLY_LIMIT - hourlyCount - 1,
      daily: DAILY_LIMIT - dailyCount - 1
    }
  };
}

exports.handler = async (event) => {
  const authError = validateAPIKey(event);
  if (authError) return authError;
  
  // Check rate limit
  const apiKey = event.headers['x-api-key'];
  const ipAddress = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'];
  const rateLimit = await checkRateLimit(apiKey, ipAddress);
  
  if (!rateLimit.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: rateLimit.error,
        resetInMs: rateLimit.resetInMs
      })
    };
  }
  
  // Continue with chat logic...
};
```

---

### Layer 3: Secure Session Management

**Problem:** Current sessionIds are predictable (sess_xxx format).

**Solution:** Cryptographically secure session tokens tied to API keys.

```javascript
const crypto = require('crypto');

function generateSecureSessionId(apiKey) {
  // Create HMAC-based session token
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString('hex');
  const hmac = crypto.createHmac('sha256', process.env.SESSION_SECRET);
  hmac.update(`${apiKey}:${timestamp}:${random}`);
  const signature = hmac.digest('hex');
  
  return `${timestamp}:${random}:${signature}`;
}

function validateSessionId(sessionId, apiKey) {
  try {
    const [timestamp, random, signature] = sessionId.split(':');
    
    // Verify HMAC signature
    const hmac = crypto.createHmac('sha256', process.env.SESSION_SECRET);
    hmac.update(`${apiKey}:${timestamp}:${random}`);
    const expectedSignature = hmac.digest('hex');
    
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid session signature' };
    }
    
    // Check if session is expired (24 hour lifetime)
    const sessionAge = Date.now() - parseInt(timestamp);
    if (sessionAge > 86400000) {
      return { valid: false, error: 'Session expired' };
    }
    
    return { valid: true };
  } catch (err) {
    return { valid: false, error: 'Malformed session ID' };
  }
}

exports.handler = async (event) => {
  // ... auth + rate limit checks ...
  
  const body = JSON.parse(event.body);
  const apiKey = event.headers['x-api-key'];
  
  // If no sessionId provided, create new one
  let sessionId = body.sessionId;
  if (!sessionId) {
    sessionId = generateSecureSessionId(apiKey);
  } else {
    // Validate existing session
    const validation = validateSessionId(sessionId, apiKey);
    if (!validation.valid) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: validation.error })
      };
    }
  }
  
  // Continue with chat logic...
};
```

---

## Metadata Sanitization

**Remove sensitive internal data from responses:**

```javascript
function sanitizeResponse(response) {
  // Return only what users need
  return {
    summary: response.summary,
    full: response.full,
    sessionId: response.sessionId,
    messageCount: response.messageCount,
    rateLimit: {
      dailyRemaining: response.rateLimit.dailyRemaining,
      hourlyRemaining: response.rateLimit.hourlyRemaining
    }
    // ❌ Remove: model, costPerMessage, cacheHit, responseTime, _meta, etc.
  };
}
```

---

## CORS Configuration

**Restrict to specific domains:**

```javascript
const ALLOWED_ORIGINS = [
  'https://maximoon.netlify.app',
  'https://bitcoinsingularity.mx', // When custom domain is set up
  'http://localhost:3000' // For local development
];

function getCORSHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
  }
  return {}; // Reject cross-origin requests from unknown origins
}

exports.handler = async (event) => {
  const origin = event.headers.origin;
  const corsHeaders = getCORSHeaders(origin);
  
  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  // ... rest of logic ...
  
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sanitizedResponse)
  };
};
```

---

## Frontend Implementation

**Update chat-mvp.html to use API key:**

```javascript
// In chat-mvp.html
const API_KEY = 'YOUR_PUBLIC_API_KEY'; // Or prompt user to enter their own key

async function sendMessage(message, sessionId) {
  const response = await fetch('/.netlify/functions/chat-mvp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({
      message: message,
      sessionId: sessionId
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}
```

---

## Environment Variables Required

Add to Netlify site settings:

```
CHAT_API_KEYS=abc123...,def456...,ghi789...
SESSION_SECRET=very_long_random_secret_key_here
ANTHROPIC_API_KEY=sk-ant-... (existing)
```

---

## Implementation Steps

### Phase 1: Add Authentication (30 minutes)
1. Generate 3 API keys
2. Add `CHAT_API_KEYS` to Netlify env vars
3. Update `chat-mvp.js` with API key validation
4. Update `chat-mvp.html` to send API key
5. Test deployment

### Phase 2: Add Rate Limiting (45 minutes)
1. Install `@netlify/blobs` package
2. Implement rate limit checking
3. Add rate limit headers to responses
4. Test with multiple rapid requests

### Phase 3: Secure Sessions (30 minutes)
1. Generate `SESSION_SECRET` and add to env vars
2. Implement session token generation/validation
3. Update session handling in function
4. Test session expiration

### Phase 4: Sanitize & CORS (15 minutes)
1. Remove sensitive metadata from responses
2. Add CORS restrictions
3. Test from allowed/disallowed origins

### Phase 5: Deploy & Test (30 minutes)
1. Deploy all changes
2. Security testing (try to bypass each layer)
3. Load testing (verify rate limits work)
4. Monitor Netlify logs for any issues

**Total implementation time: ~2.5 hours**

---

## Cost Protection

With these limits in place:

**Per API key:**
- 15 requests/hour = max $0.0375/hour (at $0.0025/request)
- 50 requests/day = max $0.125/day
- ~$3.75/month per API key

**With 3 API keys:**
- Max cost: ~$11.25/month
- Safe, predictable, no surprise bills

---

## Testing Checklist

Before going live:

- [ ] Valid API key works
- [ ] Invalid API key blocked (403)
- [ ] Missing API key blocked (401)
- [ ] Rate limit works (hourly)
- [ ] Rate limit works (daily)
- [ ] IP rotation blocked
- [ ] Session validation works
- [ ] Expired sessions rejected
- [ ] Invalid sessions rejected
- [ ] CORS blocks unauthorized domains
- [ ] No sensitive metadata in responses
- [ ] Error messages don't leak info

---

## Monitoring & Alerts

**Set up Netlify function logs monitoring:**

```javascript
// Add to function
console.log('[AUTH]', { apiKey: apiKey.substring(0, 8), success: true });
console.log('[RATE_LIMIT]', { remaining: rateLimit.remaining });
console.log('[SESSION]', { valid: sessionValidation.valid });
```

**Alert on:**
- Repeated 401/403 errors (brute force attempts)
- Rate limit 429 errors (abuse attempts)
- Unusual IP patterns

---

## Future Enhancements

**Phase 6 (Optional):**
1. User account system (email/password)
2. Per-user usage dashboard
3. Paid tiers (more requests/day)
4. Webhook notifications for limit warnings
5. API key rotation system

---

## Summary

**3-Layer Security:**
1. **API Keys** → Only authorized users can call function
2. **Rate Limits** → Prevent cost attacks (per key + per IP)
3. **Session Validation** → Prevent session hijacking

**Result:** Safe, secure chat that can't be abused.

**Ready to implement?** Let me know and I'll start with Phase 1.
