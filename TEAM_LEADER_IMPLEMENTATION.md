# Team Leader Commission Automation - Implementation Summary

## Overview

Successfully implemented automated Team Leader commission tracking for **George Coapsi** (Team Leader Setteri) and **Alexandru Prisiceanu** (Team Leader Calleri).

---

## Business Logic

### Commission Structure

| Team Leader | Role | Commission Rate | Sales Type |
|-------------|------|----------------|------------|
| **George Coapsi** | Team Leader Setteri | **5%** | Setter-generated sales |
| **Alexandru Prisiceanu** | Team Leader Calleri | **2%** | Caller-generated sales |

### How It Works

1. **Sales Detection**: System fetches all sales for current month where:
   - "Utm Campaign" contains a valid person name (CamelCase format like "ValentinDragomir")
   - "Comision Setter/Caller" > 0

2. **Role Lookup**: For each sale, the person's name is looked up in "Reprezentanți" table to determine if they are a Setter or Caller

3. **Commission Calculation**: 
   - Commission is calculated from **"Total După TVA"** (amount without VAT)
   - Setter sales → 5% goes to George Coapsi
   - Caller sales → 2% goes to Alexandru Prisiceanu

4. **Grouping**: Sales are grouped by **Team Leader + Project** combination

5. **Expense Creation**: One expense record per Team Leader + Project with total commission

---

## Implementation Details

### Files Created

#### `src/services/teamLeaderService.js`
- Complete Team Leader commission processing logic
- Functions:
  - `processTeamLeaderCommissions()` - Main processing function
  - `extractNameFromUtmCampaign()` - Extracts CamelCase names from Utm Campaign
  - `groupCommissionsByTeamLeaderAndProject()` - Groups sales by TL + Project
  - `createOrUpdateTeamLeaderExpense()` - Creates/updates expense records

### Files Modified

#### `src/config/constants.js`
- Added `TEAM_LEADERS` configuration with commission rates
- Added category options (using existing "Team Leader" category)

#### `src/index.js`
- Integrated Team Leader processing after Setter/Caller processing
- Added Team Leader stats to summary logs

---

## Expense Record Format

### Example Expense Record

```javascript
{
  "Descriere": "Comision Team Leader Caller - Alexandru Prisiceanu (28 vanzari)",
  "Tip Cheltuiala": "Comisioane",
  "Proiect": "Arta Vizibilitatii",
  "Categorie": "Team Leader",
  "Suma": 1705.14,
  "TVA Inclus": "Nu",
  "Luna": "Octombrie",
  "An": 2025,
  "Sursa": "Automat",
  "ID": "team_leader_caller_Arta_Vizibilitatii_Octombrie",
  "Vanzari Asociate": [/* Array of sale record IDs */]
}
```

### Field Explanations

- **Descriere**: `Comision Team Leader {Type} - {Name} ({count} vanzari)`
  - Type: "Setter" or "Caller"
  - Name: Team Leader name
  - count: Number of sales contributing to this commission

- **Categorie**: "Team Leader"
  - Note: Currently using the existing "Team Leader" category
  - Can be manually changed to "Team Leader Setter" or "Team Leader Caller" if those options are added to Airtable

- **ID**: `team_leader_{type}_{project}_{month}`
  - Used for duplicate prevention
  - Example: `team_leader_caller_Arta_Vizibilitatii_Octombrie`

---

## Duplicate Prevention

The system uses the expense ID to prevent duplicates:
- **First run**: Creates new expense
- **Subsequent runs**: Updates existing expense with latest data

This ensures:
- ✅ If new sales are added to a project, the Team Leader commission is recalculated
- ✅ Amount is updated to reflect current total
- ✅ Sales count is updated
- ✅ Associated sales list is updated

---

## Testing Results (October 2025)

### Statistics
- **Total sales processed**: 96
- **Setter-generated sales**: 0
- **Caller-generated sales**: 28
- **Sales skipped**: 68 (invalid names, no role, etc.)

### Commissions Created

| Team Leader | Project | Sales Count | Total Commission |
|-------------|---------|-------------|------------------|
| Alexandru Prisiceanu | Arta Vizibilitatii | 28 | 1,705.14 RON |
| George Coapsi | - | 0 | 0.00 RON |

**Note**: George Coapsi had no commissions because there were no Setter-generated sales in October 2025.

---

## Validation & Error Handling

### Input Validation

The system validates each sale before processing:
- ✅ Valid CamelCase name in Utm Campaign (e.g., "ValentinDragomir")
- ✅ Person exists in Reprezentanți table
- ✅ Person has role "Setter" or "Caller"
- ✅ Amount without VAT > 0
- ✅ Valid project name

### Skipped Sales

Sales are skipped if:
- Utm Campaign is missing or invalid format (e.g., codes like "260625")
- Person not found in Reprezentanți table
- Person has role "Sales" or "Team Leader" (not Setter/Caller)
- Missing or invalid project
- Amount without VAT is 0 or negative

### Error Logging

Comprehensive logging includes:
- Number of sales processed
- Breakdown by Setter vs Caller
- Total commissions per Team Leader
- Number of expenses created/updated
- Detailed error messages for failures

---

## Integration with Existing System

### Execution Flow

The commission automation now runs in this order:

1. **Sales Rep Commissions** → Creates expenses for sales reps
2. **Setter/Caller Commissions** → Creates expenses for setters/callers
3. **Team Leader Commissions** ← NEW! → Creates expenses for Team Leaders

All three run in the same cron job at **7:40 PM Romania time** daily.

### Data Reuse

Team Leader processing efficiently reuses data:
- Uses `getSetterCallerSales()` to fetch sales (same as Setter/Caller logic)
- Uses `findRepresentativeByFuzzyName()` to lookup roles
- Caches role lookups to avoid repeated database queries

---

## Known Limitations & Notes

### 1. Date Field Not Included

The "Data" (date) field is **not** included in Team Leader expenses because it doesn't exist in Airtable for this record type. The expense uses "Luna" and "An" fields instead for date tracking.

### 2. Category Options

Currently using the existing **"Team Leader"** category for both Setter and Caller Team Leaders.

**To separate them:**
1. Manually add "Team Leader Setter" and "Team Leader Caller" as options to the "Categorie" field in Airtable
2. Update `src/config/constants.js`:
   ```javascript
   TEAM_LEADERS: {
     SETTER: {
       name: 'George Coapsi',
       commissionRate: 0.05,
       category: 'Team Leader Setter' // Update this
     },
     CALLER: {
       name: 'Alexandru Prisiceanu',
       commissionRate: 0.02,
       category: 'Team Leader Caller' // Update this
     }
   }
   ```

### 3. Commission Calculation Source

- **Team Leader commissions**: Calculated from "Total După TVA" (amount without VAT)
- **Setter/Caller commissions**: Use "Suma Comision Setter/Caller" from monthly records
- These are SEPARATE calculations and SEPARATE expenses

---

## Manual Verification Steps

To verify Team Leader commissions are correct:

1. **Check Airtable "Cheltuieli" table**
   - Look for expenses with "Team Leader" category
   - Verify "Descriere" shows correct Team Leader name

2. **Verify Calculation**
   - Open "Vanzari Asociate" (linked sales)
   - For each sale, check "Utm Campaign" to confirm Setter/Caller name
   - Sum up "Total După TVA" for all linked sales
   - Multiply by 5% (Setter) or 2% (Caller)
   - Should match "Suma" in expense

3. **Example Verification** (October 2025):
   - Alexandru Prisiceanu expense: 1,705.14 RON
   - 28 Caller sales on "Arta Vizibilitatii"
   - Total După TVA sum: ~85,257 RON
   - 85,257 × 2% = 1,705.14 ✓

---

## Future Enhancements

Potential improvements if needed:

1. **Separate categories**: Add "Team Leader Setter" and "Team Leader Caller" in Airtable
2. **Date field**: If "Data" field is added to Airtable, uncomment the line in `teamLeaderService.js`
3. **Commission rates**: Easily adjustable in `constants.js` if business rules change
4. **Additional Team Leaders**: Easy to add new Team Leaders to the `TEAM_LEADERS` config

---

## Support & Troubleshooting

### Common Issues

**Issue**: No Team Leader expenses created
- **Cause**: No Setter/Caller sales with valid Utm Campaign names
- **Solution**: Check that sales have CamelCase names in Utm Campaign field

**Issue**: Commission amount seems wrong
- **Cause**: Commission is from "Total După TVA", not "Comision Setter/Caller"
- **Solution**: Verify calculation manually (see "Manual Verification Steps" above)

**Issue**: Expense not updating
- **Cause**: ID format might have changed
- **Solution**: Check logs for expense ID being used

### Logs to Check

All Team Leader processing logs start with:
```
=== Processing Team Leader Commissions ===
```

Look for:
- Number of sales processed
- Setter vs Caller breakdown
- Commission totals per Team Leader
- Expenses created/updated
- Any error messages

---

## Summary

✅ **Team Leader commission automation is fully implemented and tested**
✅ **George Coapsi** gets 5% of all Setter-generated sales
✅ **Alexandru Prisiceanu** gets 2% of all Caller-generated sales  
✅ **Duplicate prevention** works correctly
✅ **Grouped by project** for accurate P&L tracking
✅ **Integrated** into existing commission automation system
✅ **Runs daily** at 7:40 PM Romania time

The system is production-ready and will automatically create/update Team Leader commission expenses every day! 🚀

