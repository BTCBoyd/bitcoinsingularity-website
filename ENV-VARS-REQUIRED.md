# Environment Variables Required for Secure Chat

Add these to Netlify site settings (Site settings → Environment variables):

## REQUIRED - Generated Keys

```bash
# API Keys (comma-separated, no spaces)
CHAT_API_KEYS=26d9f2538301d393589b0619ef386e1e4f6f02b9ef6497243c5e57c27c259a1e,f9a1a7c765fb30632b17b72f01b647e65fca20f81433a5384e5e796d357f9eb0,bdb612d5c0cc84bf23c92ceda8bf64fa83236872852208868e0f75552e48c4d8

# Session Secret (HMAC signing)
SESSION_SECRET=38c43fc6d2a70f833edb5b5618a46f0f186e413e8abb01a9b867175b42f8b65207658a6be0b6bfe95271dae3b8b367d8aa79bdc42774d1d04eddcce1206f8b8d

# Anthropic API Key (already exists)
ANTHROPIC_API_KEY=sk-ant-api03-...your_existing_key
```

## OPTIONAL - Cloudflare Turnstile (Recommended)

Get from: https://dash.cloudflare.com/ → Turnstile

```bash
TURNSTILE_SECRET_KEY=0x4AAA...your_secret_key
```

**Note:** If TURNSTILE_SECRET_KEY is not set, Turnstile validation will be skipped (other layers still protect you).

---

## Public Keys (for frontend)

### API Key for public chat (use KEY_1):
```
26d9f2538301d393589b0619ef386e1e4f6f02b9ef6497243c5e57c27c259a1e
```

### Turnstile Site Key (when you get it):
```
YOUR_SITE_KEY_HERE
```

---

## How to Add to Netlify:

1. Go to: https://app.netlify.com/sites/maximoon/settings/env
2. Click "Add a variable"
3. Paste each key/value pair
4. Click "Save"
5. Redeploy site for changes to take effect
