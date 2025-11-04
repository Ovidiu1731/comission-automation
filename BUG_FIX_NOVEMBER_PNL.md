# Bug Fix: November P&L Missing Expenses

## Issue
During the hourly update for November, only the P&L Category (INCASARI) was updated, but individual expense records were not being created in the P&L table.

## Root Cause
The `mapExpenseCategoryToPNL()` function in `src/services/pnlService.js` was using **non-existent constants** for expense category mapping, causing expenses to be filtered out:

### Bugs Found:
1. ❌ `EXPENSE_CATEGORIES.STRIPE` - doesn't exist (should be `EXPENSE_CATEGORIES.TAXE_IMPOZITE`)
2. ❌ `EXPENSE_CATEGORIES.FACEBOOK_ADS` - doesn't exist (should be `EXPENSE_CATEGORIES.MARKETING`)
3. ❌ `EXPENSE_CATEGORIES.COPYWRITING` - doesn't exist (should be `EXPENSE_CATEGORIES.MARKETING`)
4. ❌ `EXPENSE_CATEGORIES.CALLER` - doesn't exist (should be `EXPENSE_CATEGORIES.CALLERI`)
5. ❌ `EXPENSE_CATEGORIES.SETTER` - doesn't exist (should be `EXPENSE_CATEGORIES.SETTERI`)

## Fix Applied

### Before (Line 218-227):
```javascript
function mapExpenseCategoryToPNL(expenseCategory) {
  const mapping = {
    [EXPENSE_CATEGORIES.FACEBOOK_ADS]: PNL_CATEGORIES.MARKETING,      // ❌ Wrong
    [EXPENSE_CATEGORIES.COPYWRITING]: PNL_CATEGORIES.MARKETING,       // ❌ Wrong
    [EXPENSE_CATEGORIES.REPRESENTATIVES]: PNL_CATEGORIES.REPREZENTANTI,
    [EXPENSE_CATEGORIES.CALLER]: PNL_CATEGORIES.CALLERI,              // ❌ Wrong
    [EXPENSE_CATEGORIES.SETTER]: PNL_CATEGORIES.SETTERI,              // ❌ Wrong
    [EXPENSE_CATEGORIES.TEAM_LEADER]: null,
    [EXPENSE_CATEGORIES.STRIPE]: PNL_CATEGORIES.TAXE_IMPOZITE         // ❌ Wrong
  };
  // ...
}
```

### After (Fixed):
```javascript
function mapExpenseCategoryToPNL(expenseCategory) {
  const mapping = {
    [EXPENSE_CATEGORIES.MARKETING]: PNL_CATEGORIES.MARKETING,          // ✅ Fixed
    [EXPENSE_CATEGORIES.REPRESENTATIVES]: PNL_CATEGORIES.REPREZENTANTI,
    [EXPENSE_CATEGORIES.CALLERI]: PNL_CATEGORIES.CALLERI,              // ✅ Fixed
    [EXPENSE_CATEGORIES.SETTERI]: PNL_CATEGORIES.SETTERI,              // ✅ Fixed
    [EXPENSE_CATEGORIES.TEAM_LEADER]: null,
    [EXPENSE_CATEGORIES.TAXE_IMPOZITE]: PNL_CATEGORIES.TAXE_IMPOZITE  // ✅ Fixed
  };
  // ...
}
```

## Impact
This bug affected **ALL expense categories** except Representatives:
- ✅ Representatives (Reprezentanti) - was working
- ❌ Stripe fees (Taxe & Impozite) - **was excluded**
- ❌ Facebook Ads (Marketing) - **was excluded**
- ❌ Copywriting (Marketing) - **was excluded**
- ❌ Callers (Calleri) - **was excluded**
- ❌ Setters (Setteri) - **was excluded**

## Verification
After the fix, for November 2025:

### Arta Vizibilitatii:
- ✅ INCASARI: 12,125 RON (2 sales)
- ✅ Stripe: 183 RON (Taxe & Impozite)
- ✅ Caller (AbagiuMario): 361.43 RON (Calleri) - **NOW INCLUDED**
- ✅ Facebook Ads: 5,904.80 RON (Marketing) - **NOW INCLUDED**
- ✅ TOTAL CHELTUIELI: 6,449.23 RON (correct sum)
- ✅ TOTAL PROFIT: 5,675.77 RON
- ✅ MARJĂ PROFIT: 46.81%

### Cheltuială Comună:
- ✅ INCASARI: 0 RON (no sales)
- ✅ Facebook Ads: 1,994.69 RON (Marketing) - **NOW INCLUDED**
- ✅ TOTAL CHELTUIELI: 1,994.69 RON
- ✅ TOTAL PROFIT: -1,994.69 RON

## Additional Note
A secondary issue was discovered: the "Cheltuială Comună" project was not in the allowed options for the Proiect field in the P&L table. This has been resolved by Airtable automatically adding it as a new option.

## Date Fixed
November 4, 2025

## Additional Improvements
After fixing the category mapping, simplified the "Cheltuiala" field names for better readability:

### Stripe Records:
- **Before**: "procesare plati Stripe - Arta Vizibilitatii (1 tranzactii, 9,150 RON procesate)"
- **After**: "Stripe"
- **Descriere**: Full description retained

### Facebook Ads Records:
- **Before**: "Facebook Ads - Arta Vizibilitatii (2 campanii, 5,904.80 RON)"
- **After**: "Facebook Ads"
- **Descriere**: Full description retained

## Files Modified
- `src/services/pnlService.js` (functions `mapExpenseCategoryToPNL` and expense name formatting logic)

