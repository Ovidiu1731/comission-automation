# Quick Start Guide

## Getting Started in 5 Minutes

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp env.example .env
# Edit .env and add your Airtable API key
```

Required environment variables:
- `AIRTABLE_API_KEY` - Get from https://airtable.com/create/tokens
- `AIRTABLE_BASE_ID` - Already set to: `appgLJnZqRhQDBLeu`

### 3. Run Locally

**Development mode (runs once immediately):**
```bash
npm run dev
```

**Production mode (schedules cron job):**
```bash
npm start
```

**Force run now in production:**
```bash
npm start -- --run-now
```

### 4. Test with Current Month

The system automatically processes the current month (October 2025). Check the logs to see:
- How many commissions were processed
- How many expenses were created
- Any warnings or errors

### 5. Verify in Airtable

Go to the "Cheltuieli" table and check for new expense records:
- Sales Rep commissions: `{Name} - {Month}` (e.g., "Popescu Razvan - Octombrie")
- Setter/Caller commissions: `Comision Setter/Caller - {Name}`

## Deployment to Railway

### Prerequisites
- Railway account (sign up at https://railway.app)
- GitHub account
- Airtable API key

### Steps

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit: Commission automation system"
git remote add origin <your-github-repo>
git push -u origin main
```

2. **Connect to Railway:**
   - Go to https://railway.app
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Configure Environment Variables:**
   In Railway dashboard, add these variables:
   ```
   AIRTABLE_API_KEY=your_key_here
   AIRTABLE_BASE_ID=appgLJnZqRhQDBLeu
   CRON_SCHEDULE=0 23 * * *
   NODE_ENV=production
   LOG_LEVEL=info
   ```

4. **Deploy:**
   - Railway will automatically build and deploy
   - Check logs to see the deployment progress

5. **Monitor:**
   - View logs in Railway dashboard
   - System runs daily at 1:00 AM Romania time
   - Check Airtable for new expenses

## Troubleshooting

### "AIRTABLE_API_KEY is required"
- Make sure .env file exists and has the API key
- Never commit .env to git

### "Rate limit exceeded"
- Normal for large datasets
- System retries automatically with exponential backoff
- Process completes in 3-5 minutes

### "No commissions found"
- Check if current month has commission records
- Verify month name is in Romanian (e.g., "Octombrie")
- Check logs for filtering criteria

### "Duplicate expense created"
- This should never happen due to ID-based prevention
- Check for database inconsistencies
- Review expense ID format in logs

## What the System Does

### Sales Rep Commissions
1. Finds all monthly commissions for current month where role = "Sales"
2. Fetches linked sales records
3. Groups sales by project
4. Calculates proportional allocation based on "Total După TVA"
5. Creates expense records per project

### Setter/Caller Commissions
1. Finds all sales for current month with non-empty "Utm Campaign"
2. Validates names using CamelCase regex (e.g., "AbagiuMario")
3. Filters out invalid entries (codes, generic terms)
4. Groups by setter/caller name and project
5. Looks up role from "Reprezentanți" table
6. Creates expense records with 5% commission totals

### Example Output

**Sales Rep Expense:**
```
Cheltuiala: "Popescu Razvan - Octombrie"
Proiect: "CODCOM"
Categorie: "Reprezentanți"
Suma: 383.68
Descriere: "Comision Sales - Popescu Razvan - Octombrie"
ID: "commission_recABC123_CODCOM"
```

**Setter/Caller Expense:**
```
Cheltuiala: "Comision Setter/Caller - AbagiuMario"
Proiect: "Arta Vizibilitatii"
Categorie: "Caller"
Suma: 455.44
Descriere: "Comision Setter/Caller - AbagiuMario (3 vanzari)"
ID: "setter_caller_AbagiuMario_Arta Vizibilitatii_octombrie"
```

## Next Steps

- Monitor first few runs to verify accuracy
- Check logs for any warnings
- Adjust cron schedule if needed
- Set up alerts for errors (optional)

## Support

For issues or questions:
- Check logs in Railway dashboard
- Review this documentation
- Verify Airtable base permissions
- Ensure environment variables are correct

