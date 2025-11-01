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
      projectCount: Object.keys(expensesByProject).length
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
        const expenses = expensesByProject[project] || {};
        
        logger.info(`Processing P&L for project: ${project}`, {
          revenue,
          salesCount,
          expenseCategories: Object.keys(expenses).length
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
 * Get all expenses grouped by project and category for a given month
 */
async function getExpensesByProject(month, year) {
  logger.debug('Fetching expenses by project', { month, year });
  
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
            
            if (project && category) {
              if (!expensesByProject[project]) {
                expensesByProject[project] = {};
              }
              
              // Map expense categories to P&L categories
              const pnlCategory = mapExpenseCategoryToPNL(category);
              
              if (pnlCategory) {
                if (!expensesByProject[project][pnlCategory]) {
                  expensesByProject[project][pnlCategory] = {
                    total: 0,
                    count: 0,
                    items: []
                  };
                }
                expensesByProject[project][pnlCategory].total += amount;
                expensesByProject[project][pnlCategory].count++;
                expensesByProject[project][pnlCategory].items.push({
                  category,
                  amount,
                  description: record.get(FIELDS.EXPENSE_DESCRIPTION)
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
 */
async function createOrUpdatePNLRecords(project, month, year, revenue, salesCount, expenses, stats) {
  const denumire = `${project} - ${month} ${year}`;
  
  logger.info('Creating/updating P&L records', {
    project,
    month,
    year,
    revenue,
    salesCount
  });
  
  // 1. Create/Update Revenue (Incasari) record
  try {
    await createOrUpdatePNLRecord(
      denumire,
      project,
      month,
      year,
      PNL_CATEGORIES.INCASARI,
      revenue,
      0, // No expenses for revenue row
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
  
  // 2. Create/Update expense records for each P&L category
  const pnlCategories = [
    PNL_CATEGORIES.MARKETING,
    PNL_CATEGORIES.REPREZENTANTI,
    PNL_CATEGORIES.CALLERI,
    PNL_CATEGORIES.SETTERI,
    PNL_CATEGORIES.TAXE_IMPOZITE
  ];
  
  for (const pnlCategory of pnlCategories) {
    try {
      const expenseData = expenses[pnlCategory];
      const expenseAmount = expenseData?.total || 0;
      const expenseCount = expenseData?.count || 0;
      
      // Build description from expense items
      let description = '';
      if (expenseData && expenseData.items.length > 0) {
        const itemDescriptions = expenseData.items.map(item => 
          `${item.category} (${item.amount.toFixed(2)} RON)`
        );
        description = itemDescriptions.join(', ');
      } else {
        description = 'Fără cheltuieli';
      }
      
      await createOrUpdatePNLRecord(
        denumire,
        project,
        month,
        year,
        pnlCategory,
        revenue,
        expenseAmount,
        description,
        stats
      );
    } catch (error) {
      logger.error('Failed to create/update expense P&L record', {
        project,
        category: pnlCategory,
        error: error.message
      });
      stats.errors++;
    }
  }
}

/**
 * Create or update a single P&L record
 */
async function createOrUpdatePNLRecord(
  denumire,
  project,
  month,
  year,
  category,
  incasari,
  cheltuieli,
  description,
  stats
) {
  try {
    // Check if record exists
    const existingRecord = await getPNLRecord(project, month, year, category);
    
    const recordData = {
      [FIELDS.PNL_DENUMIRE]: denumire,
      [FIELDS.PNL_PROJECT]: project,
      [FIELDS.PNL_MONTH]: month,
      [FIELDS.PNL_YEAR]: year,
      [FIELDS.PNL_CATEGORY]: category,
      [FIELDS.PNL_INCASARI]: incasari,
      [FIELDS.PNL_CHELTUIELI]: cheltuieli,
      [FIELDS.PNL_SOURCE]: SOURCE.AUTOMATIC,
      [FIELDS.PNL_DESCRIERE]: description
    };
    
    if (existingRecord) {
      // Update existing record
      logger.debug('Updating existing P&L record', {
        recordId: existingRecord.id,
        category,
        oldCheltuieli: existingRecord.cheltuieli,
        newCheltuieli: cheltuieli
      });
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).update([{
          id: existingRecord.id,
          fields: recordData
        }]);
      });
      
      logger.info('✅ Updated P&L record', {
        project,
        category,
        incasari,
        cheltuieli
      });
      
      stats.updated++;
    } else {
      // Create new record
      logger.debug('Creating new P&L record', {
        project,
        category,
        incasari,
        cheltuieli
      });
      
      await retryWithBackoff(async () => {
        await base(TABLES.PNL).create([{ fields: recordData }]);
      });
      
      logger.info('✅ Created P&L record', {
        project,
        category,
        incasari,
        cheltuieli
      });
      
      stats.created++;
    }
  } catch (error) {
    logger.error('Failed to create/update P&L record', {
      project,
      category,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get P&L record by project, month, year, and category
 */
async function getPNLRecord(project, month, year, category) {
  try {
    const results = [];
    
    await retryWithBackoff(async () => {
      await base(TABLES.PNL)
        .select({
          filterByFormula: `AND(
            {${FIELDS.PNL_PROJECT}} = "${project}",
            {${FIELDS.PNL_MONTH}} = "${month}",
            {${FIELDS.PNL_YEAR}} = ${year},
            {${FIELDS.PNL_CATEGORY}} = "${category}"
          )`,
          maxRecords: 1
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach(record => {
            results.push({
              id: record.id,
              denumire: record.get(FIELDS.PNL_DENUMIRE),
              category: record.get(FIELDS.PNL_CATEGORY),
              incasari: record.get(FIELDS.PNL_INCASARI),
              cheltuieli: record.get(FIELDS.PNL_CHELTUIELI)
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
      error: error.message
    });
    return null;
  }
}

