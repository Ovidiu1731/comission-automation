# Fix Plan: P&L and Cheltuieli Inconsistencies

## Issues Identified

### 1. Empty "Cheltuiala" Field in P&L Records
**Root Cause**: 
- Setter/Caller expenses are created WITHOUT setting `EXPENSE_NAME` (Cheltuiala field) - only `EXPENSE_DESCRIPTION` is set (line 288 in `setterCallerService.js`)
- When P&L records are synced, the code uses `expense.expenseName || expense.description` (line 344 in `pnlService.js`)
- If `expenseName` is empty and `description` is also empty or not properly formatted, P&L records end up with empty "Cheltuiala" field

**Affected Records**:
- ArdeleanSilvia - Noiembrie (Calleri, RON 53.72)
- Stanescu Alexandru - Noiembrie (Reprezentanti, RON 94.59)

### 2. Category Inconsistency: "Team Leader" vs "TeamLeaders"
**Root Cause**:
- Code uses `PNL_CATEGORIES.TEAM_LEADERS: 'Team Leader'` (constants.js line 126)
- Some P&L records were created with "TeamLeaders" category instead
- This creates data inconsistency and makes filtering/reporting difficult

**Affected Records**:
- Record `recUrLHBCtYHmFHsS`: "Teamleader Caller: Alexandru Prisiceanu (1 vanzari)" with category "TeamLeaders"

### 3. Duplicate P&L Records for Same Person/Month
**Root Cause**:
- Multiple expense records exist in Cheltuieli for the same person/month with different naming formats:
  - "TM Callers: Alexandru Prisiceanu" (from Team Leader service)
  - "Teamleader Caller: Alexandru Prisiceanu (X vanzari)" (from old format or different source)
- P&L sync creates separate records because `getPNLRecord` searches by exact `cheltuialaName` match
- Different naming formats don't match, creating duplicates

**Affected Records** (Noiembrie):
- "TM Callers: Alexandru Prisiceanu" (4 vanzari) - RON 423.60
- "Teamleader Caller: Alexandru Prisiceanu (1 vanzari)" - RON 144.57
- "Teamleader Caller: Alexandru Prisiceanu (2 vanzari)" - RON 273.34
- "TM Callers: Alexandru Prisiceanu" (2 vanzari) - RON 273.34
- "2 vanzari" - RON 273.34

## Fix Plan

### Phase 1: Fix Setter/Caller Expense Creation (Prevent Future Issues)

**File**: `src/services/setterCallerService.js`

**Change**: Add `EXPENSE_NAME` field when creating Setter/Caller expenses

```javascript
// Line 287-298: Add EXPENSE_NAME field
const expenseFields = {
  [FIELDS.EXPENSE_NAME]: name, // Add this line - sets Cheltuiala field
  [FIELDS.EXPENSE_DESCRIPTION]: name,
  [FIELDS.EXPENSE_PROJECT]: project,
  // ... rest of fields
};
```

**Rationale**: Ensures "Cheltuiala" field is always populated, preventing empty P&L records

---

### Phase 2: Fix P&L Category Mapping (Standardize to "Team Leader")

**File**: `src/services/pnlService.js`

**Change**: Ensure all Team Leader expenses map to "Team Leader" category (not "TeamLeaders")

**Current Code** (line 284):
```javascript
[EXPENSE_CATEGORIES.TEAM_LEADER]: PNL_CATEGORIES.TEAM_LEADERS, // Team Leader commissions
```

**Issue**: `PNL_CATEGORIES.TEAM_LEADERS` maps to "Team Leader" string, but some records have "TeamLeaders"

**Fix**: 
1. Update `mapExpenseCategoryToPNL` to ensure it always returns "Team Leader"
2. Add data cleanup script to update existing "TeamLeaders" records to "Team Leader"

---

### Phase 3: Fix Duplicate Detection in P&L Sync

**File**: `src/services/pnlService.js`

**Change**: Improve duplicate detection for Team Leader expenses

**Current Issue** (line 594-638):
- `getPNLRecord` searches by exact `cheltuialaName` match
- Different naming formats create separate records

**Fix Options**:

**Option A**: Normalize Team Leader names before searching
```javascript
// In createOrUpdatePNLRecord, normalize Team Leader names
if (category === PNL_CATEGORIES.TEAM_LEADERS) {
  // Normalize: "TM Callers: Name" or "Teamleader Caller: Name (X vanzari)" → "Name"
  const normalizedName = cheltuialaName
    .replace(/^TM\s+(Callers|Setters):\s*/, '')
    .replace(/^Teamleader\s+(Caller|Setter):\s*/, '')
    .replace(/\s*\(\d+\s+vanzari\)$/, '')
    .trim();
  
  // Search using normalized name
  const existingRecord = await getPNLRecord(project, month, year, category, normalizedName);
}
```

**Option B**: Search by person name + category + month/year (more robust)
- Extract person name from cheltuialaName
- Search for any record with same person name, category, project, month, year
- If found, update instead of creating new

**Recommendation**: Option B is more robust but requires more changes. Option A is simpler and should handle most cases.

---

### Phase 4: Data Cleanup (Fix Existing Records)

**Script**: Create cleanup script to:
1. Find P&L records with empty "Cheltuiala" field
2. Populate from "Descriere" field if available
3. Find and merge duplicate Team Leader records
4. Update "TeamLeaders" category to "Team Leader"

**Approach**:
1. Query P&L records with empty Cheltuiala
2. For each record, check if Descriere has useful info
3. Update Cheltuiala field from Descriere
4. Query duplicate Team Leader records (same person, month, project)
5. Merge amounts and delete duplicates
6. Update all "TeamLeaders" category to "Team Leader"

---

## Implementation Order

1. **Phase 1** (Fix Setter/Caller) - Prevents new empty records
2. **Phase 2** (Fix Category Mapping) - Ensures consistency going forward
3. **Phase 3** (Fix Duplicate Detection) - Prevents new duplicates
4. **Phase 4** (Data Cleanup) - Fixes existing bad data

---

## Testing Plan

After each phase:
1. Run commission processing for test month
2. Verify Cheltuieli records have "Cheltuiala" field populated
3. Verify P&L records are created correctly
4. Check for duplicates
5. Verify category consistency

---

## Risk Assessment

**Low Risk**:
- Phase 1: Adding field to expense creation (backward compatible)
- Phase 2: Category mapping fix (only affects new records)

**Medium Risk**:
- Phase 3: Duplicate detection changes (could affect existing records)
- Phase 4: Data cleanup (modifies existing data - needs backup)

**Mitigation**:
- Test on staging/test data first
- Backup Airtable before Phase 4
- Run Phase 4 during low-traffic period
- Monitor logs after deployment

