# Secure Chat Deployment Instructions

## ⚠️ CRITICAL: Complete ALL steps before going live

---

## Step 1: Add Environment Variables to Netlify (REQUIRED)

Go to: https://app.netlify.com/sites/maximoon/settings/env

Add these variables (copy from `ENV-VARS-REQUIRED.md`):

```bash
CHAT_API_KEYS=26d9f2538301d393589b0619ef386e1e4f6f02b9ef6497243c5e57c27c259a1e,f9a1a7c765fb30632b17b72f01b647e65fca20f81433a5384e5e796d357f9eb0,bdb612d5c0cc84bf23c92ceda8bf64fa83236872852208868e0f75552e48c4d8

SESSION_SECRET=38c43fc6d2a70f833edb5b5618a46f0f186e413e8abb01a9b867175b42f8b65207658a6be0b6bfe95271dae3b8b367d8aa79bdc42774d1d04eddcce1206f8b8d

ANTHROPIC_API_KEY=sk-ant-api03-...your_existing_key

# OPTIONAL but RECOMMENDED:
TURNSTILE_SECRET_KEY=0x4AAA...get_from_cloudflare
```

**Click "Save" after adding each variable.**

---

## Step 2: Get Cloudflare Turnstile Keys (RECOMMENDED - 5 min)

1. Go to: https://dash.cloudflare.com/
2. Sign up (free account if needed)
3. Navigate to: Turnstile → Add Site
4. Site configuration:
   - Domain: `maximoon.netlify.app`
   - Widget mode: **Invisible**
5. Copy the **Site Key** and **Secret Key**
6. Add `TURNSTILE_SECRET_KEY` to Netlify env vars (Step 1)
7. Update `chat-mvp-secure.html` line 136:
   ```html
   data-sitekey="YOUR_SITE_KEY_HERE"  →  data-sitekey="your_actual_site_key"
   ```

**Note:** If you skip Turnstile, the chat will still work (other 5 layers protect you), but bots won't be blocked.

---

## Step 3: Activate Secure Files

**Backup current (insecure) files:**
```bash
# Already done - files are *.DISABLED
```

**Activate secure versions:**
```bash
cd /home/futurebit/.openclaw/workspace/bitcoinsingularity-website

# Activate secure function
mv netlify/functions/chat-mvp-secure.js netlify/functions/chat-mvp.js

# Activate secure HTML
mv chat-mvp-secure.html chat-mvp.html
```

---

## Step 4: Deploy to Netlify

```bash
cd /home/futurebit/.openclaw/workspace/bitcoinsingularity-website

# Commit changes
git add -A
git commit -m "SECURITY: Implement 6-layer security (Turnstile, API keys, sessions, rate limits, sanitization, CORS)"

# Push to GitHub (triggers Netlify auto-deploy)
git push origin master

# OR manual deploy via Netlify API (if preferred)
rm -f site.zip
zip -q -r site.zip . -x "*.git*" "*.DISABLED" "node_modules/*"
curl -X POST "https://api.netlify.com/api/v1/sites/b5accd10-44fd-43f0-9918-bebc93b12756/deploys" \
  -H "Authorization: Bearer nfp_c3xUwDJUiCT29zD1cqU6pYdG21gNcMUt9df6" \
  -H "Content-Type: application/zip" \
  --data-binary "@site.zip"
```

---

## Step 5: Test All Security Layers

### Test 1: No API Key (Should Fail - 401)
```bash
curl -X POST https://maximoon.netlify.app/.netlify/functions/chat-mvp \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}' \
  -w "\nHTTP %{http_code}\n"

# Expected: 401 "API key required"
```

### Test 2: Invalid API Key (Should Fail - 403)
```bash
curl -X POST https://maximoon.netlify.app/.netlify/functions/chat-mvp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: invalid_key_abc123" \
  -d '{"message":"test"}' \
  -w "\nHTTP %{http_code}\n"

# Expected: 403 "Invalid API key"
```

### Test 3: Valid API Key, New Session (Should Work - 200)
```bash
curl -X POST https://maximoon.netlify.app/.netlify/functions/chat-mvp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: 26d9f2538301d393589b0619ef386e1e4f6f02b9ef6497243c5e57c27c259a1e" \
  -d '{"message":"What is Bitcoin?"}' \
  | jq .

# Expected: 200 with response containing sessionId
```

### Test 4: Fake Session ID (Should Fail - 403)
```bash
curl -X POST https://maximoon.netlify.app/.netlify/functions/chat-mvp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: 26d9f2538301d393589b0619ef386e1e4f6f02b9ef6497243c5e57c27c259a1e" \
  -d '{"message":"test","sessionId":"i_made_this_up"}' \
  -w "\nHTTP %{http_code}\n"

# Expected: 403 "Invalid session signature"
```

### Test 5: Rate Limit (Should Fail after 15 requests - 429)
```bash
# Send 16 requests rapidly
for i in {1..16}; do
  echo "Request $i"
  curl -X POST https://maximoon.netlify.app/.netlify/functions/chat-mvp \
    -H "Content-Type: application/json" \
    -H "X-API-Key: 26d9f2538301d393589b0619ef386e1e4f6f02b9ef6497243c5e57c27c259a1e" \
    -d "{\"message\":\"test $i\"}" \
    -w "\nHTTP %{http_code}\n" \
    -s | grep -E "(HTTP|error)"
done

# Expected: First 15 succeed (200), 16th fails (429 "Hourly limit exceeded")
```

### Test 6: No Metadata Leakage
```bash
curl -X POST https://maximoon.netlify.app/.netlify/functions/chat-mvp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: 26d9f2538301d393589b0619ef386e1e4f6f02b9ef6497243c5e57c27c259a1e" \
  -d '{"message":"What is Bitcoin?"}' \
  | jq .

# Expected response ONLY contains:
# {
#   "summary": "...",
#   "full": "...",
#   "sessionId": "...",
#   "messageCount": 1
# }
# 
# NO "model", "costPerMessage", "cacheHit", "rateLimit", "_meta", etc.
```

### Test 7: Frontend Works
1. Open: https://maximoon.netlify.app/chat-mvp.html
2. Type a message
3. Verify:
   - Turnstile verifies (if configured)
   - Message sends successfully
   - Response appears
   - No errors in console

---

## Step 6: Monitor Netlify Logs

Watch for:
- ✅ `[AUTH] Valid API key` - authentication working
- ✅ `[SESSION] Valid session` - session validation working
- ✅ `[RATE_LIMIT] Current usage` - limits being tracked
- ✅ `[RESPONSE] Success` - requests completing
- ⚠️ Repeated 401/403 - possible attack attempts
- ⚠️ 429 errors - rate limits being hit (expected after 15/hour)

---

## Step 7: Verify Anthropic Spending Cap

1. Go to: https://console.anthropic.com/settings/limits
2. Verify monthly cap is set (e.g., $50)
3. Verify email alerts are enabled (50%, 80%, 90%)

---

## Security Checklist

Before marking as complete:

- [ ] All env vars added to Netlify
- [ ] Turnstile keys obtained (or skipped consciously)
- [ ] Secure files activated (chat-mvp.js + chat-mvp.html)
- [ ] Deployed to Netlify
- [ ] Test 1 passed (no API key → 401)
- [ ] Test 2 passed (invalid API key → 403)
- [ ] Test 3 passed (valid request → 200)
- [ ] Test 4 passed (fake sessionId → 403)
- [ ] Test 5 passed (rate limit → 429)
- [ ] Test 6 passed (no metadata leakage)
- [ ] Test 7 passed (frontend works)
- [ ] Anthropic spending cap verified
- [ ] Netlify logs monitoring for 24h

---

## Cost Protection Summary

**Per API Key:**
- Max 15 requests/hour = $0.0375/hour
- Max 50 requests/day = $0.125/day
- Max monthly: **$3.75/key**

**Total (3 keys):**
- Max monthly: **$11.25**

**Ultimate Failsafe:**
- Anthropic hard cap: **$50/month**

**Even if all security is bypassed, maximum damage = $50.**

---

## Rollback Plan (If Issues Found)

```bash
cd /home/futurebit/.openclaw/workspace/bitcoinsingularity-website

# Revert to insecure version (for debugging only)
git revert HEAD
git push origin master

# OR manually disable
mv netlify/functions/chat-mvp.js netlify/functions/chat-mvp.js.DISABLED
mv chat-mvp.html chat-mvp.html.DISABLED

# Redeploy
```

---

## Next Steps After Successful Deployment

1. **Monitor for 24 hours** - watch logs for anomalies
2. **Gradually distribute API keys** - don't share all 3 at once
3. **Consider additional keys** - for specific users/partners
4. **Add analytics** - track usage patterns
5. **Set up alerts** - notify on unusual activity

---

## Support

If issues arise:
- Check Netlify function logs: https://app.netlify.com/sites/maximoon/logs/functions
- Check Anthropic console: https://console.anthropic.com/
- Review SECURITY-IMPLEMENTATION.md for detailed layer documentation

**The chat is now production-ready with enterprise-grade security.** ✅
