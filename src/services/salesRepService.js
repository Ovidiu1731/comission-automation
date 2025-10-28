/**
 * Sales Representative Commission Processing
 * 
 * Processes monthly commissions for Sales reps, allocating them
 * across projects based on proportional sales.
 */
import {
  getMonthlyCommissions,
  getSalesByIds,
  expenseExists,
  createExpense
} from './airtableService.js';
import {
  FIELDS,
  EXPENSE_CATEGORIES,
  VAT_INCLUDED,
  SOURCE,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import { isSalesRole, isValidExpenseAmount, isValidProject } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Process all Sales Rep commissions for current month
 */
export async function processSalesRepCommissions() {
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  
  logger.info('Starting Sales Rep commission processing', { month, year });
  
  try {
    // Get all monthly commissions for current month
    const commissions = await getMonthlyCommissions(month);
    
    if (commissions.length === 0) {
      logger.info('No Sales Rep commissions found for current month', { month });
      return {
        processed: 0,
        created: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each commission
    logger.info(`Starting to process ${commissions.length} commissions one by one`);
    for (let i = 0; i < commissions.length; i++) {
      const commission = commissions[i];
      try {
        logger.info(`[${i+1}/${commissions.length}] Processing commission`, {
          commissionId: commission.id,
          name: commission.name,
          salesCount: commission.sales?.length || 0
        });
        const result = await processSalesRepCommission(commission, month, year);
        logger.info(`[${i+1}/${commissions.length}] Commission processed`, {
          commissionId: commission.id,
          created: result.created,
          skipped: result.skipped
        });
        created += result.created;
        skipped += result.skipped;
      } catch (error) {
        logger.error(`[${i+1}/${commissions.length}] Failed to process Sales Rep commission`, {
          commissionId: commission.id,
          representative: commission.name,
          error: error.message,
          stack: error.stack
        });
        errors++;
      }
    }
    
    logger.info('Finished processing all commissions');
    
    logger.info('Completed Sales Rep commission processing', {
      total: commissions.length,
      created,
      skipped,
      errors
    });
    
    return {
      processed: commissions.length,
      created,
      skipped,
      errors
    };
  } catch (error) {
    logger.error('Sales Rep commission processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process a single Sales Rep commission
 * Allocates commission across projects based on sales proportions
 */
async function processSalesRepCommission(commission, month, year) {
  const { id: commissionId, finalCommission, sales: saleIds, name } = commission;
  
  logger.debug('Processing Sales Rep commission', {
    commissionId,
    representative: name,
    finalCommission,
    salesCount: saleIds.length
  });
  
  // Validate commission amount
  if (!isValidExpenseAmount(finalCommission)) {
    logger.warn('Invalid commission amount, skipping', {
      commissionId,
      finalCommission
    });
    return { created: 0, skipped: 1 };
  }
  
  // Fetch linked sales
  if (!saleIds || saleIds.length === 0) {
    logger.warn('No sales linked to commission, skipping', { commissionId });
    return { created: 0, skipped: 1 };
  }
  
  logger.info('About to fetch sales by IDs', { commissionId, saleIdsCount: saleIds.length });
  const sales = await getSalesByIds(saleIds);
  logger.info('Fetched sales successfully', { commissionId, salesCount: sales.length });
  
  if (sales.length === 0) {
    logger.warn('Could not fetch sales for commission, skipping', {
      commissionId,
      requestedCount: saleIds.length
    });
    return { created: 0, skipped: 1 };
  }
  
  // Group sales by project and calculate totals
  const projectGroups = groupSalesByProject(sales);
  
  if (Object.keys(projectGroups).length === 0) {
    logger.warn('No valid projects found in sales, skipping', { commissionId });
    return { created: 0, skipped: 1 };
  }
  
  // Calculate total sales across all projects
  const totalSales = Object.values(projectGroups).reduce(
    (sum, group) => sum + group.total,
    0
  );
  
  if (totalSales === 0) {
    logger.warn('Total sales is zero, skipping', { commissionId });
    return { created: 0, skipped: 1 };
  }
  
  // Create expense for each project allocation
  let created = 0;
  let skipped = 0;
  
  for (const [project, group] of Object.entries(projectGroups)) {
    // Skip if project is invalid
    if (!isValidProject(project)) {
      logger.warn('Invalid project name, skipping allocation', {
        commissionId,
        project
      });
      skipped++;
      continue;
    }
    
    // Calculate proportional allocation
    const allocationPercentage = (group.total / totalSales) * 100;
    const allocatedCommission = (finalCommission * group.total) / totalSales;
    
    // Round to 2 decimal places
    const roundedCommission = Math.round(allocatedCommission * 100) / 100;
    
    // Generate unique expense ID
    const expenseId = `commission_${commissionId}_${project}`;
    
    // Check if expense already exists
    const exists = await expenseExists(expenseId);
    if (exists) {
      logger.debug('Expense already exists, skipping', {
        expenseId,
        project,
        month
      });
      skipped++;
      continue;
    }
    
    // Create expense record
    try {
      const expenseData = {
        fields: {
          [FIELDS.EXPENSE_NAME]: `${name} - ${month}`,
          [FIELDS.EXPENSE_PROJECT]: project,
          [FIELDS.EXPENSE_CATEGORY]: EXPENSE_CATEGORIES.REPRESENTATIVES,
          [FIELDS.EXPENSE_DESCRIPTION]: `Comision Sales - ${name} - ${month}`,
          [FIELDS.EXPENSE_AMOUNT]: roundedCommission,
          [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
          [FIELDS.EXPENSE_DATE]: new Date().toISOString().split('T')[0],
          [FIELDS.EXPENSE_MONTH]: month,
          [FIELDS.EXPENSE_YEAR]: year,
          [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
          [FIELDS.EXPENSE_ID]: expenseId
        }
      };
      
      await createExpense(expenseData);
      
      created++;
      
      logger.info('Created Sales Rep expense', {
        expenseId,
        project,
        allocatedCommission: roundedCommission,
        allocationPercentage: allocationPercentage.toFixed(2) + '%',
        salesInProject: group.count
      });
    } catch (error) {
      logger.error('Failed to create expense for Sales Rep commission', {
        expenseId,
        project,
        error: error.message
      });
      skipped++;
    }
  }
  
  return { created, skipped };
}

/**
 * Group sales by project and calculate totals
 */
function groupSalesByProject(sales) {
  const groups = {};
  
  for (const sale of sales) {
    const project = sale.project;
    const amount = sale.amountWithoutVat || 0;
    
    if (!project) {
      logger.debug('Sale missing project, skipping', { saleId: sale.id });
      continue;
    }
    
    if (amount <= 0) {
      logger.debug('Sale amount is zero or invalid, skipping', {
        saleId: sale.id,
        amount
      });
      continue;
    }
    
    if (!groups[project]) {
      groups[project] = {
        total: 0,
        count: 0
      };
    }
    
    groups[project].total += amount;
    groups[project].count++;
  }
  
  return groups;
}

