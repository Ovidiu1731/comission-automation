# Commission & Expense Automation System

Complete expense automation for Ascendix projects, processing commissions, payment fees, and advertising costs from multiple sources.

## Overview

This Node.js application automates:
1. **Sales Rep Commissions**: Allocates monthly commissions across projects, accounting for fixed subscription fees
2. **Setter/Caller Commissions**: Creates 5% commission expenses for lead generators
3. **Team Leader Commissions**: Tracks George Coapsi (5% on Setters) and Alexandru Prisiceanu (2% on Callers)
4. **Stripe Payment Fees**: Calculates 2% processing fees on all "link de plata" payments
5. **Facebook Ads Expenses**: Fetches ad spend from Facebook Marketing API and allocates to projects
6. **Duplicate Prevention**: Uses unique IDs to avoid creating duplicate expense records
7. **Error Handling**: Comprehensive error handling, rate limiting, and logging

## Architecture

```
commission-automation/
├── src/
│   ├── config/
│   │   ├── airtable.js             # Airtable connection
│   │   └── constants.js            # Business constants & configuration
│   ├── services/
│   │   ├── airtableService.js      # Airtable CRUD operations
│   │   ├── salesRepService.js      # Sales rep commission processing
│   │   ├── setterCallerService.js  # Setter/Caller commission processing
│   │   ├── teamLeaderService.js    # Team Leader commission processing
│   │   ├── stripeService.js        # Stripe payment fee processing
│   │   ├── facebookAdsService.js   # Facebook Ads expense processing
│   │   └── facebookTokenService.js # Facebook token management
│   ├── utils/
│   │   ├── logger.js               # Winston logging
│   │   └── validators.js           # Data validation
│   └── index.js                    # Main entry with cron scheduler
├── .env                            # Environment variables (not in Git)
├── ENVIRONMENT_SETUP.md            # Detailed env var documentation
└── package.json
```

## Setup

### Prerequisites
- Node.js 18+
- Airtable API key
- Facebook App (for Ads API integration)
- Railway account (for deployment)

### Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your Airtable credentials
```

3. **Run locally:**
```bash
npm start
```

Or with auto-reload during development:
```bash
npm run dev
```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AIRTABLE_API_KEY` | Your Airtable API key | `key...` |
| `AIRTABLE_BASE_ID` | Base ID for the commission data | `appgLJnZqRhQDBLeu` |
| `FACEBOOK_APP_ID` | Facebook App ID | `123456789` |
| `FACEBOOK_APP_SECRET` | Facebook App Secret | `abc...` |
| `FACEBOOK_ACCESS_TOKEN` | Long-lived access token (60 days) | `EAAG...` |
| `FACEBOOK_AD_ACCOUNT_ID` | Facebook Ad Account ID | `act_123456789` |
| `CRON_SCHEDULE` | Cron expression for scheduling | `40 19 * * *` (daily at 7:40 PM Romania time) |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging level | `info` |

**📖 For detailed setup instructions, see [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)**

### Airtable Tables

The system interacts with 4 Airtable tables:

1. **Comisioane Lunare**: Monthly commission records
2. **Vânzări**: Individual sale records
3. **Reprezentanți**: Team member directory
4. **Cheltuieli**: Expense records (where we create records)

## How It Works

### Sales Rep Commission Processing

1. Queries monthly commissions where role = "Sales"
2. For each commission, fetches linked sales
3. Groups sales by project (Arta Vizibilitatii, CODCOM, etc.)
4. Calculates proportional allocation based on "Total După TVA"
5. Creates expense records in "Cheltuieli" table

### Setter/Caller Commission Processing

1. Queries monthly commission records from "Comisioane Lunare" where role = "Setter" or "Caller"
2. For each commission, fetches linked sales
3. Groups sales by project
4. Creates expense records with commission totals per project
5. Uses "Suma Comision Setter/Caller" from monthly record

### Team Leader Commission Processing

1. Queries monthly setter/caller commissions
2. For each linked sale, calculates Team Leader commission:
   - **Setters** → George Coapsi gets 5% of "Total După TVA"
   - **Callers** → Alexandru Prisiceanu gets 2% of "Total După TVA"
3. Groups by Team Leader AND Project
4. Creates separate expense records per Team Leader + Project combination

### Stripe Fee Processing

1. Queries sales where "Modalitate de plata" contains "link de plata" (case-insensitive)
2. Calculates 2% fee on "Suma Totală" (amount WITH VAT)
3. Groups fees by project
4. Creates expense records with TVA Inclus = "Da"

### Facebook Ads Processing

1. Authenticates with Facebook Marketing API
2. Fetches campaign-level ad spend for current month
3. Maps campaign names to projects using substring matching:
   - "Arta Vizibilitatii - Q4" → "Arta Vizibilitatii"
   - "CODCOM - Retargeting" → "CODCOM"
   - Unmapped campaigns → "Cheltuială Comună"
4. Groups spend by project
5. Creates expense records with TVA Inclus = "Da"

**Important:** 
- Verifies Ad Account currency is RON before processing
- Checks token expiry and logs warnings when < 7 days remaining
- Token must be refreshed every 60 days

### Duplicate Prevention

Uses unique IDs for each expense type:
- **Sales Reps**: `sales_rep_{name}_{project}_{month}`
- **Setters/Callers**: `setter_caller_{name}_{project}_{month}`
- **Team Leaders**: `team_leader_{type}_{project}_{month}`
- **Stripe**: `stripe_{project}_{month}`
- **Facebook Ads**: `facebook_ads_{project}_{month}`

Checks for existing records before creating expenses. Updates if already exists.

## Deployment to Railway

1. **Connect GitHub repository** to Railway
2. **Set environment variables** in Railway dashboard:
   ```
   AIRTABLE_API_KEY=your_key
   AIRTABLE_BASE_ID=appgLJnZqRhQDBLeu
   FACEBOOK_APP_ID=your_app_id
   FACEBOOK_APP_SECRET=your_app_secret
   FACEBOOK_ACCESS_TOKEN=your_long_lived_token
   FACEBOOK_AD_ACCOUNT_ID=act_XXXXXXXXXX
   CRON_SCHEDULE=40 19 * * *
   NODE_ENV=production
   LOG_LEVEL=info
   ```
   
   **📖 See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for detailed Facebook API setup**

3. **Add Airtable field options:**
   - In "Cheltuieli" table → "Categorie" field, add:
     - "Reclame Facebook"
     - "Stripe" 
     - "Team Leader"
   - In "Cheltuieli" table → "Tip Cheltuiala" field, add:
     - "Taxe și comisioane bancare"

4. **Configure deployment:**
   - Build command: (none, Railway auto-detects Node)
   - Start command: `npm start`
   
5. **Enable cron scheduling:**
   - The cron runs automatically based on `CRON_SCHEDULE`
   - Default: Daily at 7:40 PM Romania time
   - Logs are visible in Railway dashboard

## Troubleshooting

### Common Issues

**"Rate limit exceeded"**
- Airtable allows 5 requests/second
- The system implements automatic retries with exponential backoff
- Process completes eventually but may take longer

**"Duplicate expense created"**
- This should never happen due to ID-based duplicate prevention
- Check logs for any database inconsistencies

**"Role not found"**
- Setter/Caller names must match exactly with "Reprezentanți" table
- Falls back to "Setter" role if lookup fails

**"No sales for commission"**
- Logged as warning, commission is skipped
- Normal if rep had no sales that month

### Logging

Logs are structured in JSON format:
- `timestamp`: When event occurred
- `level`: info, warn, error
- `message`: Human-readable description
- `data`: Additional context

## Testing

### Manual Testing

1. **Test with real data:**
   ```bash
   NODE_ENV=development npm start
   ```

2. **Verify in Airtable:**
   - Check "Cheltuieli" table for new expenses
   - Verify amounts match expected values
   - Run again to confirm no duplicates

3. **Edge cases to verify:**
   - Sales across multiple projects
   - Valid vs invalid "Utm Campaign" names
   - Representatives with no sales
   - Missing or malformed data

## Business Rules

### Commission Calculation

- **Sales Rep**: Uses "Comision final" field, allocated proportionally
- **Setter/Caller**: 5% of "Total După TVA" (amount without VAT)
- **Always use "Total După TVA"** - never "Suma Totală" (which includes VAT)

### Project Allocation

Sales rep commissions are split across projects based on:
```
projectPercentage = projectSalesTotal / allSalesTotal
allocatedCommission = commissionTotal × projectPercentage
```

### Name Validation

Valid setter/caller names match: `/^[A-Z][a-z]+[A-Z]/`
- ✅ "AbagiuMario"
- ✅ "OprescuEric"
- ✅ "ValentinDragomir"
- ❌ "chat"
- ❌ "260625"
- ❌ "v1"

## Performance

- Typical run time: 2-3 minutes for ~100 records
- Maximum expected: 5 minutes for large datasets
- Implements rate limiting to respect Airtable's 5 req/sec limit
- Uses batch operations where possible

## Implemented Features

✅ **Sales Rep Commissions** - Proportional allocation across projects  
✅ **Setter/Caller Commissions** - 5% on all generated leads  
✅ **Team Leader Commissions** - George Coapsi (5%) & Alexandru Prisiceanu (2%)  
✅ **Stripe Payment Fees** - 2% on all online payments  
✅ **Facebook Ads Expenses** - Automated from Facebook Marketing API  
✅ **Token Management** - Automatic expiry warnings and refresh capability  
✅ **Duplicate Prevention** - ID-based tracking prevents double-entry  
✅ **Error Recovery** - Exponential backoff and retry logic  

## Future Enhancements

Potential additions:
- Email/Slack notifications for errors or token expiry
- Web dashboard for real-time monitoring
- Historical data import for previous months
- Multi-currency support
- Budget alerts and thresholds

## Support

For issues or questions:
- Check logs in Railway dashboard
- Review error messages for specific failures
- Verify environment variables are set correctly
- Ensure Airtable base is accessible with provided credentials

## License

ISC


