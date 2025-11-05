import { logger } from '../utils/logger.js';
import { 
  TABLES, 
  FIELDS, 
  PNL_CATEGORIES,
  PNL_SUMMARY_RECORDS,
  SOURCE,
  EXPENSE_CATEGORIES,
  COPYWRITING,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import { base } from '../config/airtable.js';
import { retryWithBackoff, getAllMonthYearsFromSales } from './airtableService.js';

// EUR/RON exchange rate (fixed per client requirement)
const EUR_RON_RATE = 5.08;

// Delay helper to prevent rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process P&L records for ALL months
 * Creates/updates P&L records showing revenue and expenses by project
 */
export async function processPNL() {
  logger.info('=== Processing P&L Records for ALL months ===');
  
  try {
    const monthYears = await getAllMonthYearsFromSales();
    
    if (monthYears.length === 0) {
      return {
        processed: 0,
        created: 0,
        updated: 0,
        errors: 0
      };
    }
    
    logger.info(`Processing P&L for ${monthYears.length} month-years: ${monthYears.join(', ')}`);
    
    let totalStats = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0
    };
    
    for (const monthYear of monthYears) {
      logger.info(`\n========== Processing P&L for: ${monthYear} ==========`);
      const result = await processPNLForMonthYear(monthYear);
      totalStats.processed += result.processed;
      totalStats.created += result.created;
      totalStats.updated += result.updated;
      totalStats.errors += result.errors;
    }
    
    logger.info('Completed P&L processing for all months', totalStats);
    return totalStats;
  } catch (error) {
    logger.error('P&L processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process P&L records for a specific month-year
 */
async function processPNLForMonthYear(monthYear) {
  // Parse month-year (format: "Luna YYYY")
  const parts = monthYear.split(' ');
  const month = parts[0];
  const year = parseInt(parts[1]);
  
  logger.info('Processing P&L for month-year', { monthYear, month, year });
  
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    errors: 0
  };
  
  try {
    // Step 1: Get all verified sales for the month, grouped by project
    const salesByProject = await getSalesByProject(month, year);
    
    logger.info('Fetched sales data', {
      projectCount: Object.keys(salesByProject).length,
      totalRevenue: Object.values(salesByProject).reduce((sum, data) => sum + data.total, 0)
    });
    
    // Step 2: Get all expenses for the month, grouped by project and category
    const expensesByProject = await getExpensesByProject(month, year);
    
    logger.info('Fetched expenses data', {
      projectCount: Object.keys(expensesByProject).length,
      totalExpenses: Object.values(expensesByProject).reduce((sum, items) => sum + items.length, 0)
    });
    
    // Step 3: Get all projects that have either sales or expenses
    const allProjects = new Set([
      ...Object.keys(salesByProject),
      ...Object.keys(expensesByProject)
    ]);
    
    logger.info(`Processing P&L for ${allProjects.size} projects`);
    
    // Step 4: Process each project
    for (const project of allProjects) {
      try {
        const revenue = salesByProject[project]?.total || 0;
        const salesCount = salesByProject[project]?.count || 0;
        const expenses = expensesByProject[project] || []; // Now an array
        
        logger.info(`Processing P&L for project: ${project}`, {
          revenue,
          salesCount,
          expenseCount: expenses.length
        });
        
        // Create/update P&L records for this project
        await createOrUpdatePNLRecords(project, month, year, revenue, salesCount, expenses, stats);
        
        // Add delay between projects to prevent rate limiting
        await delay(500); // 500ms between projects
        
        stats.processed++;
      } catch (error) {
        logger.error('Failed to process P&L for project', {
          project,
          error: error.message,
          stack: error.stack
        });
        stats.errors++;
      }
    }
    
    logger.info('=== P&L Processing Complete ===', stats);
    
    return stats;
  } catch (error) {
    logger.error('P&L processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get all verified sales grouped by project for a given month
 */
async function getSalesByProject(month, year) {
  logger.debug('Fetching sales by project', { month, year });
  
  const salesByProject = {};
  const monthYear = `${month} ${year}`;
  
  try {
    await retryWithBackoff(async () => {
      await base(TABLES.SALES)
        .select({
          filterByFormula: `{${FIELDS.SALE_MONTH}} = "${monthYear}"`,
          fields: [FIELDS.PROJECT, FIELDS.TOTAL_AMOUNT]
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const project = record.get(FIELDS.PROJECT);
            const amount = record.get(FIELDS.TOTAL_AMOUNT) || 0;
            
            if (project) {
              if (!salesByProject[project]) {
                salesByProject[project] = { total: 0, count: 0 };
              }
              salesByProject[project].total += amount;
              salesByProject[project].count++;
            }
          });
          fetchNextPage();
        });
    });
    
    return salesByProject;
  } catch (error) {
    logger.error('Failed to fetch sales by project', {
      month,
      year,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get all individual expenses for a given month (not aggregated)
 */
async function getExpensesByProject(month, year) {
  logger.debug('Fetching individual expenses by project', { month, year });
  
  const expensesByProject = {};
  
  try {
    await retryWithBackoff(async () => {
      await base(TABLES.EXPENSES)
        .select({
          filterByFormula: `AND(
            {${FIELDS.EXPENSE_MONTH}} = "${month}",
            {${FIELDS.EXPENSE_YEAR}} = ${year},
            {${FIELDS.EXPENSE_SOURCE}} = "${SOURCE.AUTOMATIC}"
          )`,
          fields: [
            FIELDS.EXPENSE_PROJECT,
            FIELDS.EXPENSE_CATEGORY,
            FIELDS.EXPENSE_AMOUNT,
            FIELDS.EXPENSE_DESCRIPTION
          ]
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            const project = record.get(FIELDS.EXPENSE_PROJECT);
            const category = record.get(FIELDS.EXPENSE_CATEGORY);
            const amount = record.get(FIELDS.EXPENSE_AMOUNT) || 0;
            const description = record.get(FIELDS.EXPENSE_DESCRIPTION) || '';
            
            if (project && category) {
              if (!expensesByProject[project]) {
                expensesByProject[project] = [];
              }
              
              // Map expense categories to P&L categories
              const pnlCategory = mapExpenseCategoryToPNL(category);
              
              if (pnlCategory) {
                // Store each expense as individual item
                expensesByProject[project].push({
                  category: pnlCategory,
                  expenseCategory: category,
                  amount,
                  description
                });
              }
            }
          });
          fetchNextPage();
        });
    });
    
    return expensesByProject;
  } catch (error) {
    logger.error('Failed to fetch expenses by project', {
      month,
      year,
      error: error.message
    });
    throw error;
  }
}

/**
 * Map expense category to P&L category
 */
function mapExpenseCategoryToPNL(expenseCategory) {
  const mapping = {
    [EXPENSE_CATEGORIES.MARKETING]: PNL_CATEGORIES.MARKETING, // Facebook Ads
    [EXPENSE_CATEGORIES.REPRESENTATIVES]: PNL_CATEGORIES.REPREZENTANTI,
    [EXPENSE_CATEGORIES.CALLERI]: PNL_CATEGORIES.CALLERI,
    [EXPENSE_CATEGORIES.SETTERI]: PNL_CATEGORIES.SETTERI,
    [EXPENSE_CATEGORIES.TEAM_LEADER]: PNL_CATEGORIES.TEAM_LEADERS, // Team Leader commissions
    [EXPENSE_CATEGORIES.TAXE_IMPOZITE]: PNL_CATEGORIES.TAXE_IMPOZITE, // Stripe fees
    [EXPENSE_CATEGORIES.SALARII]: PNL_CATEGORIES.SALARII // Copywriting commissions
  };
  
  return mapping[expenseCategory] || null;
}

/**
 * Create or update P&L records for a project
 * Creates individual records for each expense item
 */
async function createOrUpdatePNLRecords(project, month, year, revenue, salesCount, expenses, stats) {
  logger.info('Creating/updating P&L records', {
    project,
    month,
    year,
    revenue,
    salesCount,
    expenseCount: expenses?.length || 0
  });
  
  // 1. Create/Update Revenue (Incasari) record under P&L category
  try {
    await createOrUpdatePNLRecord(
      PNL_SUMMARY_RECORDS.INCASARI, // Cheltuiala name
      project,
      month,
      year,
      PNL_CATEGORIES.PNL, // Category is now "P&L"
      revenue, // POSITIVE value (user requested)
      `${salesCount} vânzări verificate`,
      stats
    );
  } catch (error) {
    logger.error('Failed to create/update revenue P&L record', {
      project,
      error: error.message
    });
    stats.errors++;
  }
  
  // 2. Create individual P&L record for EACH expense
  if (expenses && expenses.length > 0) {
    for (const expense of expenses) {
      try {
        // Extract name from description (e.g., "Comision Mario Cazacu" -> "Mario Cazacu")
        let cheltuialaName = expense.description;
        
        // For Stripe, check category first (most reliable), then description
        if (expense.expenseCategory === EXPENSE_CATEGORIES.TAXE_IMPOZITE && 
            (expense.description.includes('Stripe') || expense.description.includes('stripe') || expense.description.includes('procesare plati'))) {
          cheltuialaName = 'Stripe';
        }
        // For Facebook Ads, simplify to just "Facebook Ads"
        else if (expense.description.includes('Facebook Ads')) {
          cheltuialaName = 'Facebook Ads';
        }
        // For Team Leaders, use the description as-is (already formatted: "TM Setters: George Coapsi")
        else if (expense.expenseCategory === EXPENSE_CATEGORIES.TEAM_LEADER && expense.description.startsWith('TM ')) {
          cheltuialaName = expense.description;
        }
        // For commission expenses, clean up the description
        else if (expense.description.includes('Comision')) {
          cheltuialaName = expense.description.replace(/^Comision\s+/, '');
        }
        // For Copywriting, use the description as-is (already formatted: "TM Setters: George Coapsi")
        else if (expense.expenseCategory === EXPENSE_CATEGORIES.SALARII && expense.description.includes('Copywriter')) {
          cheltuialaName = 'Diana Nastase';
        }
        
        await createOrUpdatePNLRecord(
          cheltuialaName, // Individual expense name
          project,
          month,
          year,
          expense.category, // P&L category (Marketing, Reprezentanti, etc.)
          expense.amount, // Positive value for expenses
          expense.description, // Full description
          stats
        );
        
        // Small delay between expense records to prevent rate limiting
        await delay(200); // 200ms between records
      } catch (error) {
        logger.error('Failed to create/update individual expense P&L record', {
          project,
          expense: expense.description,
          error: error.message
        });
        stats.errors++;
      }
    }
  }
  
  // 3. Create/Update the 5 summary records under P&L category
  await createPNLSummaryRecords(project, month, year, revenue, expenses, stats);
}

/**
 * Create/Update the 4 summary P&L records (TOTAL CHELTUIELI, TOTAL PROFIT, MARJĂ PROFIT)
 * These records always exist under "P&L" category
 * Each record has both RON and EURO columns populated
 */
async function createPNLSummaryRecords(project, month, year, revenue, expenses, stats) {
  logger.debug('Creating P&L summary records', { project, month, year });
  
  // Calculate total expenses (sum of all expense amounts)
  const totalExpensesRON = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalExpensesEUR = totalExpensesRON / EUR_RON_RATE;
  
  // Calculate profit
  const profitRON = revenue - totalExpensesRON;
  const profitEUR = profitRON / EUR_RON_RATE;
  
  // Calculate margin percentage (profit / revenue * 100)
  const marginPercent = revenue > 0 ? (profitRON / revenue * 100) : 0;
  
  // Create/Update each summary record (4 records total)
  const summaryRecords = [
    {
      name: PNL_SUMMARY_RECORDS.TOTAL_CHELTUIELI,
      sumaRON: totalExpensesRON,
      sumaEURO: totalExpensesEUR,
      description: `Total cheltuieli pentru ${project}`
    },
    {
      name: PNL_SUMMARY_RECORDS.TOTAL_PROFIT,
      sumaRON: profitRON,
      sumaEURO: profitEUR,
      description: `Profit pentru ${project}`
    },
    {
      name: PNL_SUMMARY_RECORDS.MARJA_PROFIT,
      sumaRON: null, // No amount for margin - percentage in description only
      sumaEURO: null, // No amount for margin - percentage in description only
      description: `Marjă profit ${marginPercent.toFixed(2)}% pentru ${project}`
    }
  ];
  
  for (const record of summaryRecords) {
    try {
      await createOrUpdatePNLRecord(
        record.name,
        project,
        month,
        year,
        PNL_CATEGORIES.PNL, // All summary records under P&L category
        record.sumaRON,
        record.description,
        stats,
        record.sumaEURO // Pass EUR amount explicitly
      );
      
      // Small delay between summary records
      await delay(200); // 200ms between records
    } catch (error) {
      logger.error('Failed to create/update P&L summary record', {
        project,
        recordName: record.name,
        error: error.message
      });
      stats.errors++;
    }
  }
}

/**
 * Create or update a single P&L record
 * @param {number} sumaRON - Amount in RON
 * @param {number} sumaEURO - Amount in EURO (optional, will be calculated if not provided)
 */
async function createOrUpdatePNLRecord(
  cheltuialaName,
  project,
  month,
  year,
  category,
  sumaRON,
  description,
  stats,
  sumaEURO = null
) {
  try {
    // Check if record exists - now search by cheltuiala name too since multiple records per category
    const existingRecord = await getPNLRecord(project, month, year, category, cheltuialaName);
    
    // Calculate EUR if not provided (and if sumaRON is not null)
    const calculatedEURO = sumaEURO !== null ? sumaEURO : (sumaRON !== null ? sumaRON / EUR_RON_RATE : null);
    
    const recordData = {
      [FIELDS.PNL_CHELTUIALA]: cheltuialaName,
      [FIELDS.PNL_PROJECT]: project,
      [FIELDS.PNL_MONTH]: month,
      [FIELDS.PNL_YEAR]: year,
      [FIELDS.PNL_CATEGORY]: category,
      [FIELDS.PNL_SOURCE]: SOURCE.AUTOMATIC,
      [FIELDS.PNL_DESCRIERE]: description
    };
    
    // Only add Suma fields if they are not null (for MARJĂ PROFIT we skip these)
    if (sumaRON !== null) {
      recordData[FIELDS.PNL_SUMA_RON] = sumaRON;
    }
    if (calculatedEURO !== null) {
      recordData[FIELDS.PNL_SUMA_EURO] = calculatedEURO;
    }
    
    if (existingRecord) {
      // Update existing record
      logger.debug('Updating existing P&L record', {
        recordId: existingRecord.id,
        cheltuiala: cheltuialaName,
        category,
        oldSumaRON: existingRecord.sumaRON,
        newSumaRON: sumaRON,
        newSumaEURO: calculatedEURO
      });
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).update([{
          id: existingRecord.id,
          fields: recordData
        }]);
      });
      
      logger.info('✅ Updated P&L record', {
        project,
        cheltuiala: cheltuialaName,
        category,
        sumaRON,
        sumaEURO: calculatedEURO
      });
      
      stats.updated++;
    } else {
      // Create new record
      logger.debug('Creating new P&L record', {
        project,
        cheltuiala: cheltuialaName,
        category,
        sumaRON,
        sumaEURO: calculatedEURO
      });
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).create([{ fields: recordData }]);
      });
      
      logger.info('✅ Created P&L record', {
        project,
        cheltuiala: cheltuialaName,
        category,
        sumaRON,
        sumaEURO: calculatedEURO
      });
      
      stats.created++;
    }
  } catch (error) {
    logger.error('Failed to create/update P&L record', {
      project,
      cheltuiala: cheltuialaName,
      category,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get P&L record by project, month, year, category, and cheltuiala name
 */
async function getPNLRecord(project, month, year, category, cheltuialaName) {
  try {
    const results = [];
    
    // Escape quotes in cheltuiala name for Airtable formula
    const escapedCheltuiala = cheltuialaName.replace(/"/g, '\\"');
    
    await retryWithBackoff(async () => {
      await base(TABLES.PNL)
        .select({
          filterByFormula: `AND(
            {${FIELDS.PNL_PROJECT}} = "${project}",
            {${FIELDS.PNL_MONTH}} = "${month}",
            {${FIELDS.PNL_YEAR}} = ${year},
            {${FIELDS.PNL_CATEGORY}} = "${category}",
            {${FIELDS.PNL_CHELTUIALA}} = "${escapedCheltuiala}"
          )`,
          maxRecords: 1
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            results.push({
              id: record.id,
              cheltuiala: record.get(FIELDS.PNL_CHELTUIALA),
              category: record.get(FIELDS.PNL_CATEGORY),
              suma: record.get(FIELDS.PNL_SUMA)
            });
          });
          fetchNextPage();
        });
    });
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error('Failed to fetch P&L record', {
      project,
      month,
      year,
      category,
      cheltuialaName,
      error: error.message
    });
    return null;
  }
}

