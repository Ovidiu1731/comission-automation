#!/bin/bash

# Script to push to GitHub and deploy to Railway

echo "🚀 Commission Automation - Deployment Script"
echo ""

# Get GitHub URL
read -p "Enter your GitHub repository URL (or username): " github_input

# Check if it's a full URL or just username
if [[ $github_input == https://* ]]; then
    # It's a full URL
    GITHUB_URL="$github_input"
else
    # It's just a username
    GITHUB_URL="https://github.com/$github_input/commission-automation.git"
fi

echo ""
echo "Setting remote to: $GITHUB_URL"
git remote set-url origin "$GITHUB_URL"

echo ""
echo "📦 Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "🔧 Next: Deploy to Railway"
    echo ""
    echo "1. Go to: https://railway.app"
    echo "2. Sign in with GitHub"
    echo "3. Click 'New Project'"
    echo "4. Select 'Deploy from GitHub repo'"
    echo "5. Choose 'commission-automation'"
    echo ""
    echo "6. In Railway dashboard, go to Variables tab and add:"
    echo "   AIRTABLE_API_KEY     = (copy from .env file)"
    echo "   AIRTABLE_BASE_ID     = appgLJnZqRhQDBLeu"
    echo "   CRON_SCHEDULE        = 0 23 * * *"
    echo "   NODE_ENV             = production"
    echo "   LOG_LEVEL            = info"
    echo ""
    echo "Your API key from .env:"
    grep "AIRTABLE_API_KEY" .env
else
    echo ""
    echo "❌ Failed to push. Check the error above."
    echo ""
    echo "Common issues:"
    echo "- Wrong repository URL"
    echo "- Need to authenticate with GitHub"
    echo "- Branch name mismatch (trying 'main')"
fi

