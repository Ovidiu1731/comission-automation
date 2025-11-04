# Airtable Automation Setup Guide

## Instant P&L Updates on Manual Cheltuieli Entries

This guide will help you set up an Airtable Automation that triggers the P&L table to update **instantly** whenever you manually add a new expense record in the "Cheltuieli" table.

---

## 🎯 What This Does

When you create a **manual** expense entry in the "Cheltuieli" table (with `Sursa = "Manual"`), Airtable will automatically call your Railway app to refresh the P&L table immediately.

---

## 📋 Setup Instructions

### Step 1: Open Airtable Automations

1. Go to your Airtable base
2. Click on "Automations" in the top menu
3. Click "Create automation" or "+" to add a new automation

### Step 2: Configure the Trigger

**Trigger Type:** "When record created"

**Settings:**
- **Table:** `Cheltuieli`
- **View:** `All` (or create a specific view that filters for `Sursa = "Manual"`)
- **Condition:** Add a condition to only trigger when `Sursa` is `Manual`
  - Field: `Sursa`
  - Operator: `is`
  - Value: `Manual`

This ensures the automation only runs for manual entries, not for automatic ones created by the system.

### Step 3: Add the Action

**Action Type:** "Send request (webhook)"

**Settings:**
- **Method:** `POST`
- **URL:** `https://[your-railway-domain]/webhook/cheltuieli-created`
  - Replace `[your-railway-domain]` with your actual Railway deployment URL
  - Example: `https://comission-automation-production.up.railway.app/webhook/cheltuieli-created`
- **Headers:** (Optional, but recommended)
  - Key: `Content-Type`
  - Value: `application/json`
- **Body:** (Optional - you can send the record data if needed later)
  ```json
  {
    "recordId": "{{Record ID}}",
    "project": "{{Proiect}}",
    "amount": "{{Suma}}",
    "description": "{{Descriere}}"
  }
  ```
  Note: You can use Airtable's dynamic fields by clicking "+" in the body field.

### Step 4: Test the Automation

1. Click "Test automation" in Airtable
2. Create a test record in the Cheltuieli table with:
   - `Sursa = "Manual"`
   - Any other required fields
3. Check the automation run log in Airtable
4. Verify that the P&L table was updated

### Step 5: Turn On the Automation

1. Click "Turn on" in the top right of the automation editor
2. Done! ✅

---

## 🔍 How It Works

```
Manual Entry Created in Cheltuieli
         ↓
Airtable Automation Triggered
         ↓
Webhook Called: POST /webhook/cheltuieli-created
         ↓
Railway App Processes P&L Update
         ↓
P&L Table Updated Instantly
```

---

## 🛠️ Troubleshooting

### Automation Not Triggering?
- Check that the condition `Sursa = "Manual"` is set correctly
- Verify the automation is turned ON
- Check the automation run history for errors

### Webhook Failing?
- Verify your Railway URL is correct and the app is running
- Check Railway logs for errors
- Test the webhook manually using curl:
  ```bash
  curl -X POST https://[your-railway-domain]/webhook/cheltuieli-created \
    -H "Content-Type: application/json" \
    -d '{"test": true}'
  ```

### P&L Not Updating?
- Check Railway logs to see if the webhook was received
- Verify the expense record has all required fields (Proiect, Luna, An, Categorie)
- The P&L update happens asynchronously - it may take a few seconds

---

## 📝 Notes

- The webhook responds immediately to Airtable (so it doesn't timeout)
- The P&L processing happens in the background after the response
- Check Railway logs to monitor webhook activity and P&L updates
- This does NOT affect the hourly automatic updates - those still run as scheduled

---

## 🚀 Alternative: Manual Trigger

If you prefer to manually trigger a full refresh (Cheltuieli + P&L) instead of using an automation, you can:

1. Use this URL: `https://[your-railway-domain]/refresh/all`
2. Method: `POST`
3. Call it whenever you want to refresh everything (processes commissions and updates P&L)

You can even create a button in Airtable that calls this URL!

---

## Railway Deployment URL

Your webhook endpoint:
```
https://[your-railway-domain]/webhook/cheltuieli-created
```

Replace `[your-railway-domain]` with your actual Railway deployment URL from the Railway dashboard.

