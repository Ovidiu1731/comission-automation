# Data Cleanup Summary

## ✅ Code Changes Deployed

All code fixes have been pushed to Railway and will be deployed automatically:

1. **Phase 1**: Setter/Caller expenses now set `EXPENSE_NAME` field - prevents future empty Cheltuiala fields
2. **Phase 2**: Category mapping already correct - uses "Team Leader" 
3. **Phase 3**: Duplicate detection improved - normalizes Team Leader names before searching/creating

## 🔧 Manual Cleanup Required

Due to Airtable API permission limitations, the following need to be fixed manually or via the cleanup endpoint:

### 1. Update Category: "TeamLeaders" → "Team Leader"

**Records to update:**
- `recUrLHBCtYHmFHsS`: "Teamleader Caller: Alexandru Prisiceanu (1 vanzari)" - Change category from "TeamLeaders" to "Team Leader"
- `recVwbsC1M2Bm6xXz`: "Teamleader Setter: George Coapsi (7 vanzari)" - Change category from "TeamLeaders" to "Team Leader"

**How to fix:**
- Open Airtable → P&L's table
- Find these records
- Change "Categorie" field from "TeamLeaders" to "Team Leader"

### 2. Merge Duplicate Team Leader Records

**For Alexandru Prisiceanu - Noiembrie:**
The cleanup script will merge these automatically when run via `/cleanup/data` endpoint.

**Records that will be merged:**
- "TM Callers: Alexandru Prisiceanu" (4 vanzari) - RON 423.60
- "Teamleader Caller: Alexandru Prisiceanu (1 vanzari)" - RON 144.57  
- "Teamleader Caller: Alexandru Prisiceanu (2 vanzari)" - RON 273.34
- "TM Callers: Alexandru Prisiceanu" (2 vanzari) - RON 273.34
- "2 vanzari" - RON 273.34

**Result:** One record: "Alexandru Prisiceanu" with total amount

### 3. Fix Empty Cheltuiala Fields

**Records mentioned:**
- Calleri, Arta Vizibilitatii, RON 53.72, Noiembrie, ArdeleanSilvia - Noiembrie
- Reprezentanti, Arta Vizibilitatii, RON 94.59, Noiembrie, Stanescu Alexandru - Noiembrie

**Note:** These should be fixed automatically when the next P&L sync runs (the code now populates EXPENSE_NAME).

## 🚀 Running the Cleanup Script

Once Railway deploys (usually takes 2-5 minutes), you can run the cleanup script:

### Option 1: Via HTTP Endpoint
```bash
curl -X POST https://[your-railway-domain]/cleanup/data
```

### Option 2: Wait for Next P&L Sync
The next scheduled P&L sync will automatically:
- Use normalized names for Team Leaders (preventing new duplicates)
- Populate Cheltuiala from EXPENSE_NAME (preventing empty fields)

## 📊 Expected Results After Cleanup

1. **No empty Cheltuiala fields** - All P&L records will have names
2. **Consistent category** - All Team Leader records use "Team Leader" (not "TeamLeaders")
3. **No duplicates** - Team Leader records merged by person name + project + month
4. **Normalized names** - Team Leader records show just the person name (e.g., "Alexandru Prisiceanu" instead of "TM Callers: Alexandru Prisiceanu")

## ⚠️ Important Notes

- The cleanup script will **merge duplicate records** by summing their amounts
- The cleanup script will **delete duplicate records** after merging
- **Backup recommended** before running cleanup (though records are preserved in Cheltuieli table)
- Manual category updates can be done anytime in Airtable UI

