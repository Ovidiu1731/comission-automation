# 🚀 Deployment Guide

## Step-by-Step Deployment Instructions

### 1. Configure Your Airtable API Key

**The `.env` file has been created.** Now you need to add your actual Airtable API key:

1. **Get your API key:**
   - Go to: https://airtable.com/create/tokens
   - Click "Create new token"
   - Name: "Commission Automation"
   - Scopes: 
     - ✅ `data.records:read` 
     - ✅ `data.records:write`
   - Click "Create token"
   - Copy the token

2. **Add it to `.env` file:**
   ```bash
   # Open the .env file and replace "your_api_key_here" with your actual key
   open -e .env
   ```
   
   Or manually edit the file and replace:
   ```
   AIRTABLE_API_KEY=your_api_key_here
   ```
   
   with:
   ```
   AIRTABLE_API_KEY=patxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2. Test Locally (Optional but Recommended)

Before deploying, test that it works:

```bash
# Make sure .env has your API key
npm run dev

# This will run once immediately and process commissions
# Watch the logs for any errors
```

### 3. Prepare for Deployment

The code is already committed to git. Now let's prepare it for Railway:

```bash
# Make sure all changes are committed
git status

# If there are uncommitted changes, add them:
git add .
git commit -m "Configure for deployment"
```

### 4. Push to GitHub

You'll need to create a GitHub repository and push the code:

#### Option A: Create GitHub Repository via Web
1. Go to https://github.com/new
2. Create a new repository named: `commission-automation`
3. **Don't** initialize with README (we already have one)
4. Copy the repository URL

#### Option B: Use GitHub CLI (if installed)
```bash
gh repo create commission-automation --public --source=. --remote=origin --push
```

#### Option C: Manual Push
```bash
# Add GitHub as remote
git remote add origin https://github.com/YOUR_USERNAME/commission-automation.git

# Push code
git push -u origin main
```

### 5. Deploy to Railway

1. **Go to Railway Dashboard:**
   - Visit: https://railway.app
   - Sign in with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `commission-automation` repository

3. **Configure Environment Variables:**
   In the Railway dashboard, go to the "Variables" tab and add:
   ```
   AIRTABLE_API_KEY        = (paste your actual API key here)
   AIRTABLE_BASE_ID        = appgLJnZqRhQDBLeu
   CRON_SCHEDULE          = 0 23 * * *
   NODE_ENV               = production
   LOG_LEVEL              = info
   ```

4. **Deploy:**
   - Railway will automatically detect Node.js
   - It will run `npm install` and then `npm start`
   - The deployment will start automatically

5. **Monitor Logs:**
   - Go to "Deployments" tab
   - Click on the deployment
   - View logs to see the processing
   - System will run daily at 1:00 AM Romania time (11 PM UTC)

### 6. Verify It's Working

1. **Check Logs:**
   - Railway dashboard → Deployments → View Logs
   - Should see "Commission automation started"
   - Should see processing results

2. **Check Airtable:**
   - Go to "Cheltuieli" table
   - Look for new expense records created
   - Should see records like "Popescu Razvan - Octombrie"

3. **Test Duplicate Prevention:**
   - Run the system again manually (or wait until next scheduled run)
   - Should not create duplicate expenses
   - Logs should show "Expense already exists, skipping"

### 7. (Optional) Run Manually Anytime

To trigger a manual run in production:

```bash
# In Railway, you can trigger a redeploy to run immediately
# Or update the CRON_SCHEDULE to run more frequently for testing
```

## 📋 Quick Commands Reference

```bash
# Test locally
npm run dev

# Run in production mode (scheduled)
npm start

# Force run now
npm start -- --run-now

# Check environment variables
cat .env

# View git status
git status

# Commit changes
git add .
git commit -m "Your message"

# Push to GitHub
git push origin main
```

## 🔧 Troubleshooting

### "AIRTABLE_API_KEY is required"
- Make sure you've set the API key in Railway dashboard
- Check that it's in the Variables tab
- Redeploy after adding the variable

### "Rate limit exceeded"
- This is normal with large datasets
- System retries automatically
- Process will complete in 3-5 minutes

### No expenses created
- Check Airtable base permissions
- Verify API key has write access
- Check logs for errors
- Ensure there are commissions for current month

### Can't push to GitHub
- Make sure you have a GitHub account
- Create the repository first
- Verify the remote URL is correct

## ✅ Success Checklist

- [ ] Created Airtable API token with read/write access
- [ ] Added API key to `.env` file (local)
- [ ] Tested locally with `npm run dev`
- [ ] Pushed code to GitHub
- [ ] Created Railway project
- [ ] Added environment variables in Railway
- [ ] Deployment successful
- [ ] Checked logs - no errors
- [ ] Verified expenses created in Airtable
- [ ] Tested duplicate prevention

## 📞 Next Steps

After deployment:
1. Monitor first few runs (check logs daily)
2. Verify expenses are correct in Airtable
3. Adjust cron schedule if needed
4. Set up alerts for errors (optional)

The system is now running and will process commissions automatically every day at 1:00 AM Romania time!

