# Commission Automation System

Automates commission expense tracking for Ascendix projects by processing sales rep and setter/caller commissions from Airtable.

## Overview

This Node.js application:
1. **Processes Sales Rep Commissions**: Allocates monthly commissions across projects proportionally based on sales
2. **Processes Setter/Caller Commissions**: Creates 5% commission expenses for lead generators
3. **Prevents Duplicates**: Uses unique IDs to avoid creating duplicate expense records
4. **Handles Errors Gracefully**: Comprehensive error handling and logging

## Architecture

```
commission-automation/
├── src/
│   ├── config/
│   │   ├── airtable.js      # Airtable connection
│   │   └── constants.js     # Business constants
│   ├── services/
│   │   ├── airtableService.js
│   │   ├── salesRepService.js
│   │   └── setterCallerService.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── validators.js
│   └── index.js             # Main entry with cron
├── .env                     # Environment variables
└── package.json
```

## Setup

### Prerequisites
- Node.js 18+
- Airtable API key
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
| `CRON_SCHEDULE` | Cron expression for scheduling | `0 23 * * *` (daily at 11 PM UTC = 1 AM EET) |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging level | `info` |

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

1. Queries sales with non-empty "Utm Campaign" field
2. Validates names using CamelCase regex (e.g., "AbagiuMario")
3. Filters out invalid entries (codes, generic terms)
4. Groups by setter/caller name and project
5. Looks up role from "Reprezentanți" table
6. Creates expense records with 5% commission totals

### Duplicate Prevention

Uses unique IDs:
- Sales Reps: `commission_{commissionRecordId}_{projectName}`
- Setters/Callers: `setter_caller_{name}_{projectName}_{month}`

Checks for existing records before creating expenses.

## Deployment to Railway

1. **Connect GitHub repository** to Railway
2. **Set environment variables** in Railway dashboard:
   ```
   AIRTABLE_API_KEY=your_key
   AIRTABLE_BASE_ID=appgLJnZqRhQDBLeu
   CRON_SCHEDULE=0 23 * * *
   NODE_ENV=production
   LOG_LEVEL=info
   ```
3. **Configure deployment:**
   - Build command: (none, Railway auto-detects Node)
   - Start command: `npm start`
4. **Enable cron scheduling:**
   - The cron runs automatically based on `CRON_SCHEDULE`
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

## Future Enhancements

Potential additions (not implemented yet):
- Facebook Ads expense integration
- Stripe fee calculation
- Team Leader commission handling
- Email notifications
- Web dashboard for monitoring

## Support

For issues or questions:
- Check logs in Railway dashboard
- Review error messages for specific failures
- Verify environment variables are set correctly
- Ensure Airtable base is accessible with provided credentials

## License

ISC


