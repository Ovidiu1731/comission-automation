# Month Selection Guide - Airtable Extension

This guide explains how to use the new month selection feature in the Airtable extension.

---

## 🎯 Overview

The system now supports **two types of refresh operations**:

1. **Full Refresh** - Updates ALL months (existing functionality)
2. **Single Month Refresh** - Updates only a specific month you select

This is especially useful when you want to refresh data for a specific month (e.g., refreshing October data on November 1st) without processing all months.

---

## 📋 Available Endpoints

### 1. Get Available Months
**Endpoint:** `GET /refresh/months`

**Description:** Returns a list of all available months that can be refreshed, sorted by most recent first.

**Response:**
```json
{
  "success": true,
  "months": [
    "Noiembrie 2025",
    "Octombrie 2025",
    "Septembrie 2025",
    "August 2025",
    "Iulie 2025",
    "Iunie 2025"
  ],
  "count": 6,
  "timestamp": "2025-11-06T22:00:00.000Z"
}
```

**Usage:** Call this endpoint first to get the list of available months, then use one of them in the single-month refresh endpoint.

---

### 2. Full Refresh (All Months)
**Endpoint:** `POST /refresh/all`

**Description:** Refreshes Cheltuieli + P&L for ALL months. This is the existing functionality.

**Request Body:** None required

**Response:**
```json
{
  "success": true,
  "message": "Full refresh started for ALL months. Processing in background...",
  "timestamp": "2025-11-06T22:00:00.000Z",
  "note": "This will take 2-3 minutes. Check Cheltuieli and P&L tables to see updates."
}
```

**When to use:** When you want to refresh all data across all months.

---

### 3. Single Month Refresh
**Endpoint:** `POST /refresh/month`

**Description:** Refreshes Cheltuieli + P&L for a specific month only.

**Request Body:**
```json
{
  "monthYear": "Octombrie 2025"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Refresh started for Octombrie 2025. Processing in background...",
  "monthYear": "Octombrie 2025",
  "month": "Octombrie",
  "year": "2025",
  "timestamp": "2025-11-06T22:00:00.000Z",
  "note": "This will take 30-60 seconds. Check Cheltuieli and P&L tables to see updates."
}
```

**Error Responses:**

If `monthYear` is missing:
```json
{
  "success": false,
  "error": "monthYear parameter is required. Format: \"Luna YYYY\" (e.g., \"Octombrie 2025\")",
  "timestamp": "2025-11-06T22:00:00.000Z"
}
```

If format is invalid:
```json
{
  "success": false,
  "error": "Invalid monthYear format. Expected: \"Luna YYYY\" (e.g., \"Octombrie 2025\")",
  "received": "October 2025",
  "timestamp": "2025-11-06T22:00:00.000Z"
}
```

If month name is invalid:
```json
{
  "success": false,
  "error": "Invalid Romanian month name: Octombrie",
  "validMonths": ["Ianuarie", "Februarie", "Martie", ...],
  "received": "Octombrie 2025",
  "timestamp": "2025-11-06T22:00:00.000Z"
}
```

**When to use:** 
- On the 1st of a month when you want to refresh the previous month's data
- When you've made changes to a specific month's data and want to recalculate
- When you want faster processing (30-60 seconds vs 2-3 minutes)

---

## 🔧 Setting Up in Airtable

### Option 1: Two Separate Buttons

Create two automation buttons in Airtable:

**Button 1: "Refresh All Months"**
- Action: Send request (webhook)
- Method: `POST`
- URL: `https://[your-railway-domain]/refresh/all`
- Body: (empty or `{}`)

**Button 2: "Refresh Single Month"**
- Action: Send request (webhook)  
- Method: `POST`
- URL: `https://[your-railway-domain]/refresh/month`
- Body: 
  ```json
  {
    "monthYear": "{{Month Selection Field}}"
  }```
- Note: You'll need to create a field in Airtable where users can select the month, or use a script extension to show a dropdown.

### Option 2: Using Airtable Script Extension

You can create a custom script extension in Airtable that:

1. Calls `GET /refresh/months` to fetch available months
2. Shows a dropdown/picker for the user to select a month
3. Calls `POST /refresh/month` with the selected month

**Example Script:**
```javascript
// In Airtable Script Extension
let monthSelection = await input.buttonsAsync('Select refresh type:', [
  {label: 'All Months', value: 'all'},
  {label: 'Single Month', value: 'single'}
]);

if (monthSelection === 'single') {
  // Fetch available months
  const monthsResponse = await fetch('https://[your-railway-domain]/refresh/months');
  const monthsData = await monthsResponse.json();
  
  // Show month picker
  const selectedMonth = await input.buttonsAsync('Select month:', 
    monthsData.months.map(m => ({label: m, value: m}))
  );
  
  // Call single month refresh
  await fetch('https://[your-railway-domain]/refresh/month', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({monthYear: selectedMonth})
  });
  
  output.markdown(`✅ Refresh started for ${selectedMonth}`);
} else {
  // Call full refresh
  await fetch('https://[your-railway-domain]/refresh/all', {
    method: 'POST'
  });
  
  output.markdown('✅ Full refresh started for all months');
}
```

---

## 📝 Month Format

**Important:** The month format must be exactly: `"Luna YYYY"` where:
- `Luna` is the Romanian month name (e.g., "Octombrie", "Noiembrie")
- `YYYY` is the 4-digit year (e.g., "2025")

**Valid Examples:**
- `"Octombrie 2025"`
- `"Noiembrie 2025"`
- `"Septembrie 2025"`

**Invalid Examples:**
- `"October 2025"` (English month name)
- `"Octombrie 25"` (2-digit year)
- `"10/2025"` (Numeric format)

---

## 🚀 Processing Details

### What Gets Processed

When you refresh a single month, the system processes:

1. **Sales Rep Commissions** - For that month only
2. **Setter/Caller Commissions** - For that month only
3. **Team Leader Commissions** - For that month only
4. **Stripe Fees** - For that month only
5. **Facebook Ads Expenses** - For that month only
6. **Copywriting Commissions** - For that month only
7. **P&L Records** - For that month only

### Processing Time

- **Single Month:** 30-60 seconds
- **All Months:** 2-3 minutes

---

## 🔍 Troubleshooting

### Month Not Found

If you try to refresh a month that doesn't exist in your sales data, the system will return an empty result (no errors, but no processing happens).

**Solution:** Use `GET /refresh/months` first to see which months are available.

### Invalid Month Format

Make sure you're using the exact format: `"Luna YYYY"` with Romanian month names.

**Valid Romanian Months:**
- Ianuarie, Februarie, Martie, Aprilie, Mai, Iunie
- Iulie, August, Septembrie, Octombrie, Noiembrie, Decembrie

### Processing Takes Too Long

Single month refresh should complete in 30-60 seconds. If it takes longer:
- Check Railway logs for errors
- Verify the month has data (sales records)
- The system processes in the background, so you'll get an immediate response

---

## 📚 Related Documentation

- [AIRTABLE_AUTOMATION_SETUP.md](./AIRTABLE_AUTOMATION_SETUP.md) - General automation setup
- [WEBHOOK_SCRIPT_DETAILS.md](./WEBHOOK_SCRIPT_DETAILS.md) - What happens during processing

---

## ✅ Summary

- **Full Refresh:** `POST /refresh/all` - Processes all months (2-3 minutes)
- **Single Month:** `POST /refresh/month` with `{"monthYear": "Luna YYYY"}` - Processes one month (30-60 seconds)
- **List Months:** `GET /refresh/months` - Get available months to choose from

Use single month refresh when you need to update data for a specific month quickly, especially useful on the 1st of each month when you want to refresh the previous month's data.

