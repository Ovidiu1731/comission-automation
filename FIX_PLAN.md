# Comprehensive Fix Plan - November 4, 2025

## 🔴 PRIORITY 1: Sales Rep Commission Calculation (CRITICAL)

### Problem:
System sums individual sale commissions from Vânzări table instead of using "Comision final" from Comisioane Lunare table.

### Root Cause:
**File:** `src/services/salesRepService.js`
**Line:** 218
```javascript
const saleCommission = sale.finalCommission || 0;  // ❌ WRONG - uses individual sale commission
projectGroups[project].totalCommission += saleCommission;
```

### Solution:
Use "Comision final" from Comisioane Lunare and allocate proportionally across projects based on sales amounts.

### Implementation Steps:

1. **Change project grouping logic (lines 213-252)**:
   - Track total **sale amounts** per project (not commissions)
   - Store sale count and sale IDs per project
   
2. **Add proportional allocation logic (after line 257)**:
   - Calculate total sales amount across all projects
   - For each project, calculate allocation percentage
   - Allocate finalCommission proportionally
   - Handle debt deduction correctly (apply to total before allocation)

3. **Update expense creation (lines 270-310)**:
   - Use allocated commission amount instead of summed commissions
   - Update description to clarify it's allocated from Comisioane Lunare

### Code Changes:

```javascript
// Step 1: Group sales by project and track AMOUNTS (not commissions)
const projectGroups = {};
let totalSalesAmount = 0;

for (const sale of sales) {
  const project = sale.project;
  const saleAmount = sale.totalAmount || 0;  // Use AMOUNT, not commission
  
  if (!project || !isValidProject(project) || saleAmount <= 0) {
    continue;
  }
  
  if (!projectGroups[project]) {
    projectGroups[project] = {
      totalAmount: 0,  // Track amounts, not commissions
      salesCount: 0,
      saleIds: []
    };
  }
  
  projectGroups[project].totalAmount += saleAmount;
  projectGroups[project].salesCount++;
  projectGroups[project].saleIds.push(sale.id);
  totalSalesAmount += saleAmount;
}

// Step 2: Allocate netCommission (from Comisioane Lunare) proportionally
for (const [project, group] of Object.entries(projectGroups)) {
  const allocationPercentage = group.totalAmount / totalSalesAmount;
  const allocatedCommission = netCommission * allocationPercentage;
  
  // Round to 2 decimal places
  const roundedCommission = Math.round(allocatedCommission * 100) / 100;
  
  // Create expense with ALLOCATED commission
  // ... rest of expense creation logic
}
```

### Testing Plan:

1. **Test Case 1 - Rebecca Dodoi:**
   - Comisioane Lunare: 3,292 RON
   - Expected in Cheltuieli: Exactly 3,292 RON (split across projects)
   - Verify sum of project allocations = 3,292 RON

2. **Test Case 2 - Popescu Razvan:**
   - Comisioane Lunare: 1,192 RON
   - Expected in Cheltuieli: Exactly 1,192 RON (split across projects)
   - Verify sum of project allocations = 1,192 RON

3. **Test Case 3 - Debt Scenario:**
   - Original commission: 1,000 RON
   - Outstanding debt: 200 RON
   - Net commission: 800 RON
   - Expected in Cheltuieli: 800 RON (split proportionally)

---

## 🔴 PRIORITY 2: Fix EUR/RON Exchange Rate

### Problem:
Currently using dynamic exchange rate; needs to be fixed at 5.08 RON.

### Solution:

**File:** `src/services/pnlService.js`
**Line:** 17

```javascript
// CURRENT:
const EUR_RON_RATE = 5.0;

// CHANGE TO:
const EUR_RON_RATE = 5.08;  // Fixed rate per client requirement
```

**File:** `src/config/constants.js`
**Line:** 198

```javascript
// CURRENT:
eurRonRate: 5.0

// CHANGE TO:
eurRonRate: 5.08  // Fixed rate per client requirement
```

---

## 🔴 PRIORITY 3: Investigate Stripe Fee Calculation

### Problem:
Minor discrepancies in Stripe fee amounts.

### Investigation Steps:

1. Verify the fee calculation formula:
   - Should be: 2% of "Suma Totală" for payments containing "link"
   
2. Check payment method filtering:
   - Case-insensitive match for "link"
   
3. Verify which sales are being included

### Files to Check:
- `src/services/stripeService.js`

### Testing:
- Run Stripe calculation for October
- Compare against client's manual verification
- Log all included payments and their fees

---

## 🟡 PRIORITY 4: Enable Negative Expense Entries

### Problem:
System blocks negative values in "Suma" field for manual expenses.

### Solution:

**File:** `src/utils/validators.js`

```javascript
export function isValidExpenseAmount(amount) {
  // For AUTOMATIC expenses, must be positive
  // For MANUAL expenses, can be negative (for corrections)
  return typeof amount === 'number' && !isNaN(amount);
}
```

**Note:** Need to pass `source` parameter to validator and only allow negative for Manual entries.

### Airtable Configuration:
Remove any field validation that prevents negative numbers in "Suma" field.

---

## 🟡 PRIORITY 5: Single Refresh Button for Both P&Ls

### Solution:

**File:** `src/index.js`

Add new endpoint:

```javascript
// Refresh both P&Ls simultaneously
app.post('/refresh/both-pnls', async (req, res) => {
  logger.info('Manual refresh for both P&Ls triggered via webhook');
  
  try {
    // Process main P&L
    const pnlResults = await processPNL();
    
    // Process second P&L (if exists)
    // const pnl2Results = await processPNL2();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        pnl1: pnlResults,
        // pnl2: pnl2Results
      }
    });
  } catch (error) {
    logger.error('Manual refresh for both P&Ls failed', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### Airtable Configuration:
- Create new button extension
- Point to `/refresh/both-pnls` endpoint

---

## 🟡 PRIORITY 6: Team Leader Category

### Status:
Category already exists in code constants:

```javascript
export const EXPENSE_CATEGORIES = {
  TEAM_LEADER: 'Team Leader',
  // ... others
}
```

### Action Required:
**Airtable Configuration:**
1. Go to "Cheltuieli" table
2. Field: "Categorie"
3. Add "Team Leader" as an option (if not already present)

### Additional:
Remove October Team Leader entries (client said they weren't active that month).

---

## 🟢 PRIORITY 7: Global Month Selector

### Status:
Deferred - will implement after critical issues are resolved.

### Design:
- Create new Airtable view with all projects and months
- Use linked records or formula fields to show all months
- Alternative: Create interface with month filter that applies globally

---

## 🟢 PRIORITY 8: Multi-Month View per Project

### Status:
Deferred - lower priority.

---

## 📊 TESTING CHECKLIST

After implementing fixes, verify:

### ✅ Sales Rep Commissions:
- [ ] Rebecca Dodoi: Total = 3,292 RON exactly
- [ ] Popescu Razvan: Total = 1,192 RON exactly
- [ ] All other reps: Match Comisioane Lunare exactly
- [ ] Total discrepancy = 0 RON

### ✅ Caller Commissions:
- [ ] All amounts still correct (no regression)

### ✅ Setter Commissions:
- [ ] All amounts still correct (no regression)

### ✅ Stripe Fees:
- [ ] Calculation verified against source
- [ ] Minor discrepancies resolved

### ✅ Facebook Ads:
- [ ] October: 41,465.21 RON ✓ (already fixed)
- [ ] November: Updates hourly ✓ (already working)

### ✅ EUR/RON Rate:
- [ ] All conversions use 5.08 rate
- [ ] P&L table shows correct EUR amounts

### ✅ Negative Expenses:
- [ ] Can create manual expense with negative Suma
- [ ] Automatic expenses still require positive values

### ✅ Team Leader:
- [ ] Category appears in dropdown
- [ ] October entries removed

---

## 🚀 DEPLOYMENT PLAN

1. **Create backup of current system**
2. **Implement Priority 1 fix (Sales Rep commissions)**
3. **Test thoroughly with October data**
4. **Implement Priority 2 (EUR/RON rate)**
5. **Implement Priority 3 (Stripe investigation)**
6. **Implement Priority 4-6 (configuration changes)**
7. **Full system test with all October data**
8. **Deploy to production**
9. **Monitor first hourly run**
10. **Client verification session**

---

## 📝 NOTES

- **Source of Truth:** Comisioane Lunare table for sales rep commissions
- **Critical:** Commission amounts must be exact - affects payments to team
- **Facebook Ads:** Now working correctly with hourly updates
- **Manual entries:** Must preserve through automated updates (already working)

---

## 🔍 VERIFICATION DATA

Client has access to real numbers for verification:
- Comisioane Lunare (October)
- Vânzări (October)
- Facebook Ads Manager (October actual spend)
- Stripe dashboard (October fees)

All fixes must be verified against these sources before deployment.

