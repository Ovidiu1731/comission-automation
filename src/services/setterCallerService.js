/**
 * Setter/Caller Commission Processing
 * 
 * Processes commissions from monthly commission records in "Comisioane Lunare" table.
 * Allocates "Suma Comision Setter/Caller" proportionally across projects.
 */
import {
  getMonthlySetterCallerCommissions,
  getAllMonthsWithCommissions,
  getSalesByIds,
  expenseExists,
  getExpenseByExpenseId,
  createExpense,
  updateExpense
} from './airtableService.js';
import {
  FIELDS,
  EXPENSE_CATEGORIES,
  VAT_INCLUDED,
  SOURCE,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import {
  isValidExpenseAmount,
  isValidProject
} from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Process all Setter/Caller commissions for ALL months
 */
export async function processSetterCallerCommissions() {
  logger.info('Starting Setter/Caller commission processing for ALL months');
  
  try {
    // Get all unique months
    const months = await getAllMonthsWithCommissions();
    
    if (months.length === 0) {
      logger.info('No months with commissions found');
      return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    logger.info(`Processing ${months.length} months: ${months.join(', ')}`);
    
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalProcessed = 0;
    
    // Process each month
    for (const month of months) {
      logger.info(`\n========== Processing Setter/Caller for month: ${month} ==========`);
      const result = await processSetterCallerCommissionsForMonth(month);
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      totalProcessed += result.processed;
    }
    
    logger.info('Completed Setter/Caller commission processing for all months', {
      monthsProcessed: months.length,
      totalProcessed,
      totalCreated,
      totalUpdated,
      totalSkipped,
      totalErrors
    });
    
    return {
      processed: totalProcessed,
      created: totalCreated,
      updated: totalUpdated,
      skipped: totalSkipped,
      errors: totalErrors
    };
  } catch (error) {
    logger.error('Failed to process Setter/Caller commissions', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process Setter/Caller commissions for a specific month
 */
async function processSetterCallerCommissionsForMonth(month) {
  const year = getCurrentYear();
  
  logger.info('Processing Setter/Caller commissions for month', { month, year });
  
  try {
    // Get all monthly commissions for Setters/Callers
    const commissions = await getMonthlySetterCallerCommissions(month);
    
    if (commissions.length === 0) {
      logger.info('No Setter/Caller commissions found for current month', { month });
      return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    logger.info(`Starting to process ${commissions.length} Setter/Caller commissions one by one`);
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each commission one by one
    for (let i = 0; i < commissions.length; i++) {
      const commission = commissions[i];
      logger.info(`[${i + 1}/${commissions.length}] Processing Setter/Caller commission`, {
        id: commission.id,
        name: commission.name,
        role: commission.role
      });
      
      try {
        const result = await processSetterCallerCommission(commission, month, year);
        created += result.created;
        updated += result.updated || 0;
        skipped += result.skipped;
        
        logger.info(`[${i + 1}/${commissions.length}] Commission processed`, {
          created: result.created,
          updated: result.updated || 0,
          skipped: result.skipped
        });
      } catch (error) {
        logger.error(`Failed to process Setter/Caller commission ${commission.id}`, {
          error: error.message,
          stack: error.stack
        });
        errors++;
      }
    }
    
    logger.info('Finished processing all Setter/Caller commissions');
    
    return {
      processed: commissions.length,
      created,
      updated,
      skipped,
      errors
    };
  } catch (error) {
    logger.error('Failed to process Setter/Caller commissions', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process a single Setter/Caller commission record
 */
async function processSetterCallerCommission(commission, month, year) {
  const { 
    id: commissionId, 
    setterCallerCommission, 
    sales: saleIds, 
    name, 
    role 
  } = commission;
  
  logger.info('Processing Setter/Caller commission', {
    commissionId,
    name,
    role,
    commission: setterCallerCommission,
    salesCount: saleIds?.length || 0
  });
  
  // Validate commission amount
  if (!isValidExpenseAmount(setterCallerCommission)) {
    logger.warn('Invalid Setter/Caller commission amount (negative or zero), skipping expense creation', {
      commissionId,
      name,
      commission: setterCallerCommission
    });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Check if there are associated sales
  if (!saleIds || saleIds.length === 0) {
    logger.warn('No associated sales for Setter/Caller commission, skipping', {
      commissionId,
      name
    });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Fetch full sale records
  logger.info('About to fetch sales by IDs', { commissionId, saleIds: saleIds.slice(0, 3) });
  const sales = await getSalesByIds(saleIds);
  logger.info('Fetched sales successfully', { commissionId, salesCount: sales.length });
  
  // Group sales by project
  logger.info('About to group sales by project', { commissionId, salesCount: sales.length });
  const projectGroups = groupSalesByProject(sales);
  logger.info('Grouped sales by project', { commissionId, projectCount: Object.keys(projectGroups).length });
  
  if (Object.keys(projectGroups).length === 0) {
    logger.warn('No valid projects found in sales, skipping', { commissionId, name });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Calculate total commissions across all projects
  const totalCommissions = Object.values(projectGroups).reduce(
    (sum, group) => sum + group.total,
    0
  );
  
  if (totalCommissions === 0) {
    logger.warn('Total project commissions is zero, skipping', { commissionId, name });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Determine category based on role
  const category = role.includes('Caller') ? EXPENSE_CATEGORIES.CALLERI : EXPENSE_CATEGORIES.SETTERI;
  
  // Create expense for each project allocation
  let created = 0;
  let updated = 0;
  
  for (const [project, group] of Object.entries(projectGroups)) {
    logger.info(`Processing project: ${project}`, {
      commissionId,
      name,
      projectCommission: group.total,
      salesCount: group.count
    });
    
    // Calculate proportional allocation
    const allocationPercentage = (group.total / totalCommissions) * 100;
    const allocatedCommission = (setterCallerCommission * group.total) / totalCommissions;
    const roundedCommission = Math.round(allocatedCommission * 100) / 100;
    
    logger.info(`Allocation for ${project}:`, {
      percentage: allocationPercentage.toFixed(2) + '%',
      allocated: roundedCommission,
      salesInProject: group.count
    });
    
    // Validate project and commission
    if (!isValidProject(project)) {
      logger.warn('Invalid project name, skipping', { commissionId, name, project });
      continue;
    }
    
    if (!isValidExpenseAmount(roundedCommission)) {
      logger.warn('Invalid allocated commission amount, skipping', {
        commissionId,
        name,
        project,
        amount: roundedCommission
      });
      continue;
    }
    
    // Generate unique expense ID
    const expenseId = `setter_caller_${commissionId}_${project}`.replace(/\s+/g, '_');
    
    // Get sale IDs for this project
    const saleIds = group.sales.map(sale => sale.id);
    
    // Prepare expense data
    // Note: 'name' already includes the month (e.g., "AbagiuMario - Octombrie")
    const expenseFields = {
      [FIELDS.EXPENSE_NAME]: name, // Set Cheltuiala field to prevent empty P&L records
      [FIELDS.EXPENSE_DESCRIPTION]: name,
      [FIELDS.EXPENSE_PROJECT]: project,
      [FIELDS.EXPENSE_CATEGORY]: category,
      [FIELDS.EXPENSE_AMOUNT]: roundedCommission,
      [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
      [FIELDS.EXPENSE_MONTH]: month,
      [FIELDS.EXPENSE_YEAR]: year,
      [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
      [FIELDS.EXPENSE_ID]: expenseId,
      [FIELDS.EXPENSE_ASSOCIATED_SALES]: saleIds
    };
    
    try {
      // Check if expense already exists
      const existingExpense = await getExpenseByExpenseId(expenseId);
      
      if (existingExpense) {
        // Update existing expense
        await updateExpense(existingExpense.id, {
          fields: expenseFields
        });
        
        updated++;
        
        logger.info('✅ Updated Setter/Caller expense', {
          expenseId,
          name,
          project,
          category,
          oldAmount: existingExpense.amount,
          newAmount: roundedCommission,
          allocationPercentage: allocationPercentage.toFixed(2) + '%',
          salesCount: group.count
        });
      } else {
        // Create new expense
        await createExpense({
          fields: expenseFields
        });
        
        created++;
        
        logger.info('✅ Created Setter/Caller expense', {
          expenseId,
          name,
          project,
          category,
          allocatedCommission: roundedCommission,
          allocationPercentage: allocationPercentage.toFixed(2) + '%',
          salesCount: group.count
        });
      }
    } catch (error) {
      logger.error('Failed to create/update expense for Setter/Caller', {
        expenseId,
        name,
        project,
        error: error.message
      });
    }
  }
  
  return { created, updated, skipped: 0 };
}

/**
 * Group sales by project and calculate total commissions
 */
function groupSalesByProject(sales) {
  const groups = {};
  
  for (const sale of sales) {
    const project = sale.project;
    const commission = sale.finalCommission || 0;
    
    if (!project) {
      logger.debug('Sale missing project, skipping', { saleId: sale.id });
      continue;
    }
    
    if (commission <= 0) {
      logger.debug('Sale commission is zero or invalid, skipping', {
        saleId: sale.id,
        commission
      });
      continue;
    }
    
    if (!groups[project]) {
      groups[project] = {
        total: 0,
        count: 0,
        sales: []
      };
    }
    
    groups[project].total += commission;
    groups[project].count++;
    groups[project].sales.push({
      id: sale.id,
      commission: commission
    });
  }
  
  return groups;
}
