# Monthly Commission Records Implementation for Team Leaders and Copywriters

## Overview

The system has been enhanced to create and update records in the **"Comisioane Lunare"** (Monthly Commissions) table for Team Leaders and Copywriters, enabling them to receive monthly commission reports just like Sales representatives, Setters, and Callers.

## What Was Changed

### 1. New Helper Functions in `airtableService.js`

Added four new functions to manage monthly commission records:

- **`getRepresentativeByExactName(name)`** - Finds a representative by exact name match
- **`getMonthlyCommissionByRepAndMonth(representativeId, month)`** - Retrieves existing monthly commission record
- **`createMonthlyCommission(commissionData)`** - Creates a new monthly commission record
- **`updateMonthlyCommission(recordId, updateData)`** - Updates an existing monthly commission record

### 2. Enhanced Team Leader Service (`teamLeaderService.js`)

**New Function**: `createOrUpdateTeamLeaderMonthlyCommission()`

- Creates/updates monthly commission records for each team leader
- Groups all sales across projects for each team leader
- Links all relevant sales to the commission record
- Updates the **"Vânzări"** (Sales) field with all associated sale IDs

**Team Leaders Configured**:
- **George Coapsi** (Team Leader Setteri) - 5% commission from Setter sales
- **Alexandru Prisiceanu** (Team Leader Calleri) - 2% commission from Caller sales

**Process Flow**:
1. Calculates team leader commissions from Setter/Caller sales
2. Aggregates sales across all projects per team leader
3. Creates/updates monthly commission record in "Comisioane Lunare"
4. Creates/updates individual expense records per project in "Cheltuieli"

### 3. Enhanced Copywriting Service (`copywritingService.js`)

**New Function**: `createOrUpdateCopywriterMonthlyCommission()`

- Creates/updates monthly commission records for copywriters
- Collects all sales identified by Utm Campaign
- Links all relevant sales to the commission record
- Calculates progressive commission based on tiered rates

**Copywriter Configured**:
- **Diana Nastase** - Progressive commission (5% to 10% based on volume)

**Process Flow**:
1. Identifies copywriter sales by Utm Campaign match
2. Calculates total progressive commission
3. Creates/updates monthly commission record in "Comisioane Lunare"
4. Creates/updates individual expense records per project in "Cheltuieli"

## How It Works

### For Team Leaders

Every time the system runs:

1. **Fetches Setter/Caller commissions** from "Comisioane Lunare" table
2. **Identifies associated sales** for each Setter/Caller
3. **Calculates team leader commissions**:
   - George Coapsi: 5% of "Total După TVA" from Setter sales
   - Alexandru Prisiceanu: 2% of "Total După TVA" from Caller sales
4. **Creates/Updates monthly commission record**:
   - Searches for team leader in "Reprezentanți" table
   - Creates or updates record in "Comisioane Lunare" with all sales
5. **Creates/Updates expense records** per project in "Cheltuieli"

### For Copywriters

Every time the system runs:

1. **Fetches all sales** for current month
2. **Filters by Utm Campaign** (matches "diananastase")
3. **Calculates progressive commission** across all sales
4. **Creates/Updates monthly commission record**:
   - Searches for copywriter in "Reprezentanți" table
   - Creates or updates record in "Comisioane Lunare" with all sales
5. **Creates/Updates expense records** per project in "Cheltuieli"

## Data Structure

### Monthly Commission Record Format

When a record is created/updated in "Comisioane Lunare", it contains:

```javascript
{
  [FIELDS.REPRESENTATIVE]: [representativeId],  // Link to Reprezentanți
  [FIELDS.MONTH]: month,                         // e.g., "Octombrie"
  [FIELDS.SALES]: saleIds                        // Array of all associated sale IDs
}
```

The following fields are **automatically calculated** by Airtable formulas:
- **Nume** - Concatenates Representative name and Month
- **Comision final** - Calculated commission after adjustments
- **Rol** - Looked up from Representative record
- **Sumă Comision** - Rolled up from linked sales
- etc.

## Prerequisites

### Important: Representatives Must Exist

For the system to create monthly commission records, the following representatives **must exist** in the **"Reprezentanți"** table with the exact names:

1. **George Coapsi** (Role: Team Leader)
2. **Alexandru Prisiceanu** (Role: Team Leader)
3. **Diana Nastase** (Role: Copywriter)

If a representative doesn't exist, the system will:
- Log a warning message
- Skip creating the monthly commission record for that person
- Continue processing expenses normally

### Adding Missing Representatives

If any of the above representatives are missing, add them to the "Reprezentanți" table:

1. **Nume**: Exact name (e.g., "George Coapsi")
2. **Email**: Contact email
3. **CIF**: Tax identification number (if applicable)
4. **Rol**: "Team Leader" or "Copywriter"

## Benefits

### For Report Generation

Now that Team Leaders and Copywriters have records in "Comisioane Lunare":

1. **Automated Report Triggers** - The "Trimite Raport de Vanzari" button works for them
2. **Unified Dashboard** - All commission records visible in one place
3. **Sales Tracking** - All associated sales linked to each commission record
4. **Historical Data** - Month-by-month commission history

### For Expense Tracking

The system continues to create detailed expense records:

- **Per-project breakdown** in "Cheltuieli" table
- **Automatic categorization** (Team Leader, Copywriting)
- **Associated sales linkage** for full transparency
- **Update capability** - Re-running updates amounts if sales change

## Logging and Monitoring

The system provides detailed logging for debugging:

### Team Leaders
```
✅ Created monthly commission record for team leader
✅ Updated monthly commission record for team leader
⚠️  Team leader not found in Representatives table
```

### Copywriters
```
✅ Created monthly commission record for copywriter
✅ Updated monthly commission record for copywriter
⚠️  Copywriter not found in Representatives table
```

## Testing

To verify the implementation:

1. **Check Representatives** - Ensure George Coapsi, Alexandru Prisiceanu, and Diana Nastase exist
2. **Run the system** - Execute `npm start` or trigger the cron job
3. **Verify "Comisioane Lunare"** - Check that new records were created for team leaders and copywriters
4. **Verify "Cheltuieli"** - Confirm expense records were created per project
5. **Check Sales Links** - Verify the "Vânzări" field contains all associated sales

## Configuration

Team leader and copywriter settings are defined in `/src/config/constants.js`:

```javascript
export const TEAM_LEADERS = {
  SETTER: {
    name: 'George Coapsi',
    commissionRate: 0.05,  // 5%
    category: 'Team Leader'
  },
  CALLER: {
    name: 'Alexandru Prisiceanu',
    commissionRate: 0.02,  // 2%
    category: 'Team Leader'
  }
};

export const COPYWRITING = {
  copywriter: {
    name: 'Diana Nastase',
    utmIdentifier: 'diananastase',
  },
  category: 'Copywriting',
  tiers: [
    { max: 10000, rate: 0.05 },    // 5% up to €10,000
    { max: 25000, rate: 0.075 },   // 7.5% €10,001-€25,000
    { max: Infinity, rate: 0.10 }  // 10% over €25,001
  ],
  eurRonRate: 5.0
};
```

## Error Handling

The system gracefully handles errors:

- **Missing representative** → Logs warning, skips commission record, continues
- **Duplicate records** → Updates existing record instead of creating duplicate
- **Invalid sales** → Skips invalid sales, processes valid ones
- **Airtable errors** → Retries with exponential backoff

## Summary

✅ Team leaders and copywriters now get monthly commission records  
✅ All associated sales are properly linked  
✅ Expense records are created per project  
✅ System gracefully handles missing representatives  
✅ Full audit trail with detailed logging  
✅ Ready for monthly commission report generation  

---

**Last Updated**: November 1, 2025  
**Version**: 1.0.0

