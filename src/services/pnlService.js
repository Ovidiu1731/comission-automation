import { logger } from '../utils/logger.js';
import { 
  TABLES, 
  FIELDS, 
  PNL_CATEGORIES,
  SOURCE,
  EXPENSE_CATEGORIES,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import { base } from '../config/airtable.js';
import { retryWithBackoff } from './airtableService.js';

/**
 * Process P&L records for the current month
 * Creates/updates P&L records showing revenue and expenses by project
 */
export async function processPNL() {
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  
  logger.info('=== Processing P&L Records ===', { month, year });
  
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
    [EXPENSE_CATEGORIES.FACEBOOK_ADS]: PNL_CATEGORIES.MARKETING,
    [EXPENSE_CATEGORIES.COPYWRITING]: PNL_CATEGORIES.MARKETING,
    [EXPENSE_CATEGORIES.REPRESENTATIVES]: PNL_CATEGORIES.REPREZENTANTI,
    [EXPENSE_CATEGORIES.CALLER]: PNL_CATEGORIES.CALLERI,
    [EXPENSE_CATEGORIES.SETTER]: PNL_CATEGORIES.SETTERI,
    [EXPENSE_CATEGORIES.TEAM_LEADER]: null, // Will be handled separately based on description
    [EXPENSE_CATEGORIES.STRIPE]: PNL_CATEGORIES.TAXE_IMPOZITE
  };
  
  // Special handling for Team Leaders
  if (expenseCategory === EXPENSE_CATEGORIES.TEAM_LEADER) {
    // Team Leaders are already split by Caller/Setter in expenses, so we skip them here
    // They'll be picked up by the Caller/Setter categories
    return null;
  }
  
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
  
  // 1. Create/Update Revenue (Incasari) record
  // Revenue is stored as NEGATIVE expense so P&L formula shows it as positive
  try {
    await createOrUpdatePNLRecord(
      PNL_CATEGORIES.INCASARI, // Cheltuiala name
      project,
      month,
      year,
      PNL_CATEGORIES.INCASARI,
      -revenue, // Negative value - revenue is stored as negative expense
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
        
        // For commission expenses, clean up the description
        if (expense.description.includes('Comision')) {
          cheltuialaName = expense.description.replace(/^Comision\s+/, '');
        }
        
        // For FB ads, use the campaign description
        if (expense.expenseCategory === 'Reclame Facebook') {
          cheltuialaName = expense.expenseCategory;
        }
        
        // For Copywriting, use the category name
        if (expense.expenseCategory === 'Copywriting') {
          cheltuialaName = expense.expenseCategory;
        }
        
        // For Stripe, simplify
        if (expense.expenseCategory === 'Stripe') {
          cheltuialaName = 'Stripe';
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
}

/**
 * Create or update a single P&L record
 */
async function createOrUpdatePNLRecord(
  cheltuialaName,
  project,
  month,
  year,
  category,
  suma,
  description,
  stats
) {
  try {
    // Check if record exists - now search by cheltuiala name too since multiple records per category
    const existingRecord = await getPNLRecord(project, month, year, category, cheltuialaName);
    
    const recordData = {
      [FIELDS.PNL_CHELTUIALA]: cheltuialaName,
      [FIELDS.PNL_PROJECT]: project,
      [FIELDS.PNL_MONTH]: month,
      [FIELDS.PNL_YEAR]: year,
      [FIELDS.PNL_CATEGORY]: category,
      [FIELDS.PNL_SUMA]: suma,
      [FIELDS.PNL_SOURCE]: SOURCE.AUTOMATIC,
      [FIELDS.PNL_DESCRIERE]: description
    };
    
    if (existingRecord) {
      // Update existing record
      logger.debug('Updating existing P&L record', {
        recordId: existingRecord.id,
        cheltuiala: cheltuialaName,
        category,
        oldSuma: existingRecord.suma,
        newSuma: suma
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
        suma
      });
      
      stats.updated++;
    } else {
      // Create new record
      logger.debug('Creating new P&L record', {
        project,
        cheltuiala: cheltuialaName,
        category,
        suma
      });
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).create([{ fields: recordData }]);
      });
      
      logger.info('✅ Created P&L record', {
        project,
        cheltuiala: cheltuialaName,
        category,
        suma
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

