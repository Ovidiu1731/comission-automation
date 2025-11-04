# Webhook Script Details

## What Runs When `/webhook/cheltuieli-created` is Called

When you create a manual expense in the Cheltuieli table and the Airtable automation triggers the webhook, here's exactly what happens:

---

## 🔄 Execution Flow

### 1. **Webhook Endpoint** (`/webhook/cheltuieli-created`)
```javascript
// Responds immediately to Airtable
res.json({ success: true, message: 'P&L refresh queued' });

// Then runs processPNL() asynchronously
await processPNL();
```

### 2. **processPNL()** Function
Located in: `src/services/pnlService.js`

#### Step-by-Step:

**A. Fetch Revenue Data**
```javascript
getSalesByProject(month, year)
```
- Queries all verified sales from the "Vânzări" table
- Groups by project
- Calculates total revenue per project

**B. Fetch Expense Data**
```javascript
getExpensesByProject(month, year)
```
- Queries all **automatic** expenses from "Cheltuieli" table
  - Filter: `Sursa = "Automat"`
  - Filter: Month and Year match
- Groups by project
- Returns individual expense items (not aggregated)

**C. Process Each Project**
For every project with sales or expenses:

1. **Create/Update INCASARI Record**
   - Cheltuiala: `INCASARI`
   - Categorie: `P&L`
   - Suma RON: Revenue (positive)
   - Suma EURO: Revenue / 5.0
   - Descriere: "X vânzări verificate"

2. **Create/Update Individual Expense Records**
   For each expense:
   - Cheltuiala: Individual expense name (e.g., "Mario Cazacu - Octombrie")
   - Categorie: Mapped P&L category (Marketing, Reprezentanti, Calleri, Setteri, etc.)
   - Suma RON: Expense amount
   - Suma EURO: Amount / 5.0
   - Descriere: Full expense description

3. **Create/Update Summary Records**
   
   **TOTAL CHELTUIELI:**
   - Cheltuiala: `TOTAL CHELTUIELI`
   - Categorie: `P&L`
   - Suma RON: Sum of all expenses
   - Suma EURO: Sum / 5.0
   - Descriere: "Total cheltuieli pentru [Project]"
   
   **TOTAL PROFIT:**
   - Cheltuiala: `TOTAL PROFIT`
   - Categorie: `P&L`
   - Suma RON: Revenue - Total Expenses
   - Suma EURO: Profit / 5.0
   - Descriere: "Profit pentru [Project]"
   
   **MARJĂ PROFIT:**
   - Cheltuiala: `MARJĂ PROFIT`
   - Categorie: `P&L`
   - Suma RON: *(empty)*
   - Suma EURO: *(empty)*
   - Descriere: "Marjă profit X% pentru [Project]"

---

## 📊 Example Output

For **Arta Vizibilitatii** in **Octombrie 2025**:

### Revenue:
| Cheltuiala | Categorie | Suma RON | Suma EURO | Descriere |
|------------|-----------|----------|-----------|-----------|
| INCASARI | P&L | 341,475.00 | 68,295.00 | 88 vânzări verificate |

### Individual Expenses:
| Cheltuiala | Categorie | Suma RON | Suma EURO |
|------------|-----------|----------|-----------|
| Mario Cazacu - Octombrie | Reprezentanti | 10,500.00 | 2,100.00 |
| IonPopescu - Octombrie | Setteri | 1,234.56 | 246.91 |
| Facebook Ads - Arta... | Marketing | 5,000.00 | 1,000.00 |
| Diana Nastase | Marketing | 8,536.88 | 1,707.38 |
| Stripe fees | Taxe & Impozite | 6,829.50 | 1,365.90 |
| ... | ... | ... | ... |

### Summary Records:
| Cheltuiala | Categorie | Suma RON | Suma EURO | Descriere |
|------------|-----------|----------|-----------|-----------|
| TOTAL CHELTUIELI | P&L | 30,130.12 | 6,026.02 | Total cheltuieli pentru Arta Vizibilitatii |
| TOTAL PROFIT | P&L | 311,344.88 | 62,268.98 | Profit pentru Arta Vizibilitatii |
| MARJĂ PROFIT | P&L | - | - | Marjă profit 91.18% pentru Arta Vizibilitatii |

---

## 🔑 Key Points

### What Gets Included:
- ✅ All **automatic** expenses (`Sursa = "Automat"`)
- ✅ All verified sales for the month
- ✅ Expenses are grouped by project
- ✅ Each expense gets its own P&L line item

### What Gets Excluded:
- ❌ Manual expenses (`Sursa = "Manual"`) are **NOT** included in P&L
- ❌ Old/archived expenses from previous months

### Category Mapping:
```
Cheltuieli Category → P&L Category
─────────────────────────────────────
Reprezentanti       → Reprezentanti
Calleri             → Calleri
Setteri             → Setteri
Team Leader         → TeamLeaders
Marketing           → Marketing
Taxe & Impozite     → Taxe & Impozite
```

### EUR/RON Exchange Rate:
- Fixed at **5.0** (1 EUR = 5 RON)
- Applied to all amounts automatically

---

## 🧪 How to Test

### Method 1: Run the Test Script
```bash
node test-pnl-update.js
```

### Method 2: Call the Webhook Manually
```bash
curl -X POST https://your-railway-domain.up.railway.app/webhook/cheltuieli-created \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Method 3: Trigger via Airtable
1. Create a record in "Cheltuieli" table
2. Set `Sursa = "Manual"`
3. Watch the automation run

---

## 📝 Notes

- **Execution Time:** Typically 5-15 seconds depending on data volume
- **Idempotent:** Running multiple times won't create duplicates - records are updated if they exist
- **Async Processing:** Webhook responds immediately, P&L processes in background
- **Logging:** All operations are logged to Railway console

---

## 🐛 Troubleshooting

**P&L not updating?**
- Check Railway logs for errors
- Verify the expense has `Sursa = "Automat"`
- Ensure Month and Year are set correctly

**Wrong amounts?**
- Check if all expenses are categorized correctly
- Verify EUR/RON rate is 5.0 in `pnlService.js`

**Missing projects?**
- Projects only appear if they have sales OR expenses for the month
- Check if the project name matches exactly in both tables

