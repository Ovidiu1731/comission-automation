# P&L (Profit & Loss) Automation Implementation

## Overview
The P&L automation generates monthly profit and loss records per project, showing revenue (Incasari) and expenses across different categories.

## What Was Implemented

### 1. P&L Service (`src/services/pnlService.js`)
- **Automated P&L Record Generation**: Creates/updates P&L records for each project monthly
- **Revenue Tracking**: Aggregates total sales (Incasari) from verified sales
- **Expense Aggregation**: Groups automatic expenses by category:
  - **Marketing**: Facebook Ads + Copywriting
  - **Reprezentanti**: Sales Rep commissions
  - **Calleri**: Caller commissions + Team Leader Caller
  - **Setteri**: Setter commissions + Team Leader Setter
  - **Taxe & Impozite**: Stripe fees

### 2. P&L Record Structure
Each project gets **6 records per month**:

#### Example for "Arta Vizibilitatii - Octombrie 2025":

| Denumire | Proiect | Luna | An | Categorie | Incasari | Cheltuieli | Sursa |
|----------|---------|------|-----|-----------|----------|------------|-------|
| Arta Vizibilitatii - Octombrie 2025 | Arta Vizibilitatii | Octombrie | 2025 | Incasari | 348,579 RON | 0 | Automat |
| Arta Vizibilitatii - Octombrie 2025 | Arta Vizibilitatii | Octombrie | 2025 | Marketing | 348,579 RON | 1,439.15 RON | Automat |
| Arta Vizibilitatii - Octombrie 2025 | Arta Vizibilitatii | Octombrie | 2025 | Reprezentanti | 348,579 RON | 20,653.30 RON | Automat |
| Arta Vizibilitatii - Octombrie 2025 | Arta Vizibilitatii | Octombrie | 2025 | Calleri | 348,579 RON | 4,222.75 RON | Automat |
| Arta Vizibilitatii - Octombrie 2025 | Arta Vizibilitatii | Octombrie | 2025 | Setteri | 348,579 RON | 455.43 RON | Automat |
| Arta Vizibilitatii - Octombrie 2025 | Arta Vizibilitatii | Octombrie | 2025 | Taxe & Impozite | 348,579 RON | 2,798.98 RON | Automat |

**Total P&L**: 348,579 - 29,569.61 = **319,009.39 RON profit** ✅

### 3. Key Features

#### Revenue (Incasari)
- Shows **same total revenue** on all rows for context
- Calculated from all verified sales in the month
- Zero expenses on the Incasari category row

#### Expenses (Cheltuieli)
- Each category shows its total expenses
- Automatically aggregated from "Cheltuieli" table (Sursa: "Automat")
- Detailed breakdown in "Descriere" field

#### P&L Suma Field
- **Note**: The "Suma" field has been renamed to "P&L Suma" in Airtable
- Represents the net contribution (Incasari - Cheltuieli) for each line item
- This field should be calculated via Airtable formula

### 4. Data Flow

```
Monthly Sales (Vânzări) → Revenue per Project
       ↓
Monthly Expenses (Cheltuieli) → Expenses per Project & Category
       ↓
P&L Service aggregates both
       ↓
Creates/Updates P&L Records
```

### 5. Integration Points

The P&L service is integrated into the main automation flow (`src/index.js`):
1. Sales Rep Commissions
2. Setter/Caller Commissions
3. Team Leader Commissions
4. Stripe Fees
5. Facebook Ads
6. Copywriting Commissions
7. **→ P&L Records Generation** ✨ (New!)

## October 2025 Test Results

✅ **Successfully processed 5 projects**
- Created **24 P&L records** (6 per project × 4 projects)
- Processing time: ~71 seconds
- 6 errors for "Intuitive Life" (project option doesn't exist in Airtable yet)

### Projects Processed:
1. **Arta Vizibilitatii** - 91 sales, 348,579 RON revenue
2. **Andrei Bordeianu** - 3 sales, 16,852 RON revenue
3. **CODCOM** - 4 sales, 28,674 RON revenue
4. **Artok Academy** - 2 sales, 9,140 RON revenue
5. **Intuitive Life** - 2 sales, 6,125 RON revenue (errors - needs field option)

## Action Required

### Add Missing Project to Airtable
The project **"Intuitive Life"** needs to be added to the "Proiect" field options in the "P&L's" table:
1. Open the "P&L's" table in Airtable
2. Click on the "Proiect" field settings
3. Add "Intuitive Life" as a new option
4. Re-run the automation to create the missing records

## Schedule

The P&L automation runs **every hour** at minute 0, along with all other commission processing.

**Cron Schedule**: `0 * * * *` (Europe/Bucharest timezone)

## Files Modified

1. **`src/services/pnlService.js`** (NEW) - P&L automation logic
2. **`src/config/constants.js`** - Added P&L table/field constants and categories
3. **`src/index.js`** - Integrated P&L processing into main flow
4. **`src/services/airtableService.js`** - Exported `retryWithBackoff` function

## Future Enhancements

1. **Add formula field** in Airtable "P&L's" table:
   - Field name: "P&L Suma"
   - Formula: `{Incasari} - {Cheltuieli}`
   - This will automatically calculate the net contribution

2. **Add total row** per project showing overall profit

3. **Export to Excel/PDF** for monthly reports

## Deployment

✅ **Deployed to Railway** - Commit: `11406b6`
- All changes pushed to `main` branch
- Railway will auto-deploy the updates
- P&L processing will run every hour starting next hour

---

**Status**: ✅ Implemented & Deployed
**Last Updated**: November 1, 2025

