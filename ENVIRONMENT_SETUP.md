# Environment Variables Setup

This document explains how to configure all required environment variables for the Commission Automation System.

## Required Environment Variables

### Airtable Configuration

```bash
# Your Airtable API key
# Get it from: https://airtable.com/account
AIRTABLE_API_KEY=your_airtable_api_key_here

# Your Airtable Base ID
# Find it in the URL: https://airtable.com/YOUR_BASE_ID/...
AIRTABLE_BASE_ID=your_airtable_base_id_here
```

### Facebook Marketing API Configuration

#### 1. Facebook App Credentials

```bash
# Facebook App ID
# Get from: https://developers.facebook.com/apps/
FACEBOOK_APP_ID=your_facebook_app_id_here

# Facebook App Secret
# Get from: https://developers.facebook.com/apps/ → Settings → Basic
FACEBOOK_APP_SECRET=your_facebook_app_secret_here
```

**How to get App ID and Secret:**
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or use existing one
3. Add "Marketing API" product
4. Go to Settings → Basic
5. Copy App ID and App Secret

#### 2. Facebook Access Token

```bash
# Long-lived access token (valid for 60 days)
FACEBOOK_ACCESS_TOKEN=your_long_lived_access_token_here
```

**How to generate a Long-Lived Access Token:**

**Step 1: Get Short-Lived Token (1 hour)**
1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Click "Generate Access Token"
4. Select permissions:
   - `ads_read`
   - `ads_management`
5. Copy the token (valid for 1 hour)

**Step 2: Exchange for Long-Lived Token (60 days)**

Use this API call:
```bash
curl "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=YOUR_APP_ID&\
client_secret=YOUR_APP_SECRET&\
fb_exchange_token=YOUR_SHORT_LIVED_TOKEN"
```

Or use the `refreshAccessToken()` function in `facebookTokenService.js`.

The response will contain a `access_token` that's valid for ~60 days.

**Step 3: Update Railway**
1. Go to Railway project → Variables
2. Update `FACEBOOK_ACCESS_TOKEN` with the new long-lived token

**Important:** You'll need to refresh this token every 60 days.

#### 3. Facebook Ad Account ID

```bash
# Format: act_XXXXXXXXXX
FACEBOOK_AD_ACCOUNT_ID=act_XXXXXXXXXX
```

**How to find your Ad Account ID:**
1. Go to [Facebook Business Manager](https://business.facebook.com/)
2. Click "Business Settings" (gear icon)
3. Click "Ad Accounts" in left menu
4. Select your Ad Account
5. Copy the Account ID (format: `act_123456789`)

**Important:** Make sure this Ad Account's currency is set to **RON** (Romanian Leu). The system will verify this on each run.

### Optional Configuration

```bash
# Cron schedule (default: 7:40 PM Romania time)
# Format: minute hour day month dayOfWeek
CRON_SCHEDULE=40 19 * * *

# Node environment
NODE_ENV=production
```

## Setting Up in Railway

1. Go to your Railway project
2. Click on your service
3. Go to "Variables" tab
4. Add each environment variable:
   - Click "+ New Variable"
   - Enter variable name (e.g., `FACEBOOK_APP_ID`)
   - Enter value
   - Click "Add"
5. Repeat for all variables
6. Redeploy service for changes to take effect

## Security Best Practices

1. **Never commit `.env` file to Git**
   - Already in `.gitignore`
   - Contains sensitive tokens

2. **Rotate tokens regularly**
   - Facebook tokens expire every 60 days
   - Set calendar reminder to refresh

3. **Use different tokens for dev/prod**
   - If testing locally, use separate app/account
   - Don't use production tokens in development

4. **Limit token permissions**
   - Only grant `ads_read` permission
   - Don't grant write permissions unless needed

## Verification

After setting up all variables, verify they work:

```bash
# Run locally with .env file
npm start

# Check logs for:
✓ Airtable connection initialized
✓ Facebook access token valid
✓ Ad Account currency verified: RON
```

## Troubleshooting

### "Missing Facebook API credentials"
- Check that all 4 Facebook variables are set:
  - `FACEBOOK_APP_ID`
  - `FACEBOOK_APP_SECRET`
  - `FACEBOOK_ACCESS_TOKEN`
  - `FACEBOOK_AD_ACCOUNT_ID`

### "Invalid or expired Facebook access token"
- Token has expired (60 days)
- Generate new long-lived token
- Update Railway variable

### "Ad Account currency is not RON"
- Go to Facebook Business Manager
- Ad Accounts → Settings → Currency
- Change to RON (Romanian Leu)
- May require creating new Ad Account if currency locked

### "Insufficient permissions"
- Token doesn't have `ads_read` permission
- Regenerate token with correct permissions

## Token Refresh Automation

The system automatically checks token expiry and logs warnings when token expires in < 7 days.

**Manual Refresh:**
```bash
# Use the token service
import { refreshAccessToken } from './src/services/facebookTokenService.js';

const result = await refreshAccessToken(
  process.env.FACEBOOK_APP_ID,
  process.env.FACEBOOK_APP_SECRET,
  process.env.FACEBOOK_ACCESS_TOKEN
);

console.log('New token:', result.accessToken);
// Update Railway variable with new token
```

## Next Steps

After configuring all variables:

1. ✅ Add "Reclame Facebook" to Airtable "Categorie" field
2. ✅ Verify Ad Account currency is RON
3. ✅ Run automation manually to test
4. ✅ Verify expenses created correctly
5. ✅ Compare with Facebook Ads Manager totals
6. ✅ Enable automatic cron schedule

