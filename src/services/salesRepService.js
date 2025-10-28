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
  getExpenseByExpenseId,
  getRepresentativeDebts,
  createExpense,
  updateExpense
} from './airtableService.js';
import {
  FIELDS,
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES,
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
        updated: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    let created = 0;
    let updated = 0;
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
          updated: result.updated || 0,
          skipped: result.skipped
        });
        created += result.created;
        updated += (result.updated || 0);
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
      updated,
      skipped,
      errors
    });
    
    return {
      processed: commissions.length,
      created,
      updated,
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
 * Applies debt carryover from previous negative months
 */
async function processSalesRepCommission(commission, month, year) {
  const { id: commissionId, finalCommission, sales: saleIds, name, representativeName, representative } = commission;
  
  logger.debug('Processing Sales Rep commission', {
    commissionId,
    representative: name,
    finalCommission,
    salesCount: saleIds.length
  });
  
  // Validate commission amount
  if (!isValidExpenseAmount(finalCommission)) {
    logger.warn('Invalid commission amount (negative or zero), skipping expense creation', {
      commissionId,
      finalCommission,
      note: 'This will be tracked as debt for future months'
    });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Check for outstanding debts from previous months
  let netCommission = finalCommission;
  let debtInfo = null;
  
  if (representative && representative.length > 0) {
    const representativeId = Array.isArray(representative) ? representative[0] : representative;
    
    logger.info('Checking for outstanding debts', {
      commissionId,
      representativeId,
      currentMonth: month
    });
    
    const debts = await getRepresentativeDebts(representativeId, month);
    
    if (debts.length > 0) {
      const totalDebt = Math.abs(debts.reduce((sum, d) => sum + d.amount, 0));
      
      logger.info('⚠️  Found outstanding debts to deduct', {
        commissionId,
        representative: name,
        currentCommission: finalCommission,
        totalDebt: totalDebt,
        debtMonths: debts.map(d => d.month).join(', ')
      });
      
      netCommission = finalCommission - totalDebt;
      
      debtInfo = {
        debts: debts,
        totalDebt: totalDebt,
        originalCommission: finalCommission,
        netCommission: netCommission
      };
      
      if (netCommission <= 0) {
        logger.warn('Net commission is zero or negative after debt deduction, skipping expense creation', {
          commissionId,
          representative: name,
          originalCommission: finalCommission,
          totalDebt: totalDebt,
          netCommission: netCommission,
          note: 'Debt partially or fully offsets current commission'
        });
        return { created: 0, updated: 0, skipped: 1 };
      }
      
      logger.info('✅ Commission after debt deduction', {
        commissionId,
        representative: name,
        originalCommission: finalCommission,
        debtDeducted: totalDebt,
        netCommission: netCommission
      });
    }
  }
  
  // Fetch linked sales
  if (!saleIds || saleIds.length === 0) {
    logger.warn('No sales linked to commission, skipping', { commissionId });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  logger.info('About to fetch sales by IDs', { commissionId, saleIdsCount: saleIds.length });
  const sales = await getSalesByIds(saleIds);
  logger.info('Fetched sales successfully', { commissionId, salesCount: sales.length });
  
  if (sales.length === 0) {
    logger.warn('Could not fetch sales for commission, skipping', {
      commissionId,
      requestedCount: saleIds.length
    });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  logger.info('About to group sales by project', { commissionId, salesCount: sales.length });
  // Group sales by project and calculate totals
  const projectGroups = groupSalesByProject(sales);
  logger.info('Grouped sales by project', { commissionId, projectCount: Object.keys(projectGroups).length });
  
  if (Object.keys(projectGroups).length === 0) {
    logger.warn('No valid projects found in sales, skipping', { commissionId });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Calculate total sales across all projects
  const totalSales = Object.values(projectGroups).reduce(
    (sum, group) => sum + group.total,
    0
  );
  
  if (totalSales === 0) {
    logger.warn('Total sales is zero, skipping', { commissionId });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Create expense for each project allocation
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  logger.info('About to create expenses for projects', { 
    commissionId, 
    projectCount: Object.keys(projectGroups).length,
    projects: Object.keys(projectGroups)
  });
  
  for (const [project, group] of Object.entries(projectGroups)) {
    logger.info('Processing project allocation', { commissionId, project, salesInProject: group.count });
    // Skip if project is invalid
    if (!isValidProject(project)) {
      logger.warn('Invalid project name, skipping allocation', {
        commissionId,
        project
      });
      skipped++;
      continue;
    }
    
    // Calculate proportional allocation using NET commission (after debt deduction)
    const allocationPercentage = (group.total / totalSales) * 100;
    const allocatedCommission = (netCommission * group.total) / totalSales;
    
    // Round to 2 decimal places
    const roundedCommission = Math.round(allocatedCommission * 100) / 100;
    
    // Generate unique expense ID
    const expenseId = `commission_${commissionId}_${project}`;
    
    // Check if expense already exists
    logger.info('Checking if expense exists', { commissionId, expenseId, project });
    const existingExpense = await getExpenseByExpenseId(expenseId);
    
    // Build description with debt info if applicable
    let description = `${representativeName || name.split(' - ')[0]} - ${month}`;
    if (debtInfo) {
      description += ` (Comision: ${debtInfo.originalCommission.toFixed(2)} RON - Datorie: ${debtInfo.totalDebt.toFixed(2)} RON = Net: ${debtInfo.netCommission.toFixed(2)} RON)`;
    }
    
    // Collect sale IDs for this project
    const saleIds = group.sales.map(sale => sale.id);
    
    // Prepare expense data
    const expenseFields = {
      [FIELDS.EXPENSE_DESCRIPTION]: description,
      [FIELDS.EXPENSE_TYPE]: EXPENSE_TYPES.COMMISSIONS,
      [FIELDS.EXPENSE_PROJECT]: project,
      [FIELDS.EXPENSE_CATEGORY]: EXPENSE_CATEGORIES.REPRESENTATIVES,
      [FIELDS.EXPENSE_AMOUNT]: roundedCommission,
      [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
      [FIELDS.EXPENSE_DATE]: new Date().toISOString().split('T')[0],
      [FIELDS.EXPENSE_MONTH]: month,
      [FIELDS.EXPENSE_YEAR]: year,
      [FIELDS.EXPENSE_SOURCE]: SOURCE.AUTOMATIC,
      [FIELDS.EXPENSE_ID]: expenseId,
      [FIELDS.EXPENSE_ASSOCIATED_SALES]: saleIds
    };
    
    try {
      if (existingExpense) {
        // Update existing expense
        logger.info('Updating existing Sales Rep expense', {
          expenseId,
          project,
          oldAmount: existingExpense.amount,
          newAmount: roundedCommission
        });
        
        await updateExpense(existingExpense.id, {
          fields: expenseFields
        });
        
        updated++;
        
        logger.info('✅ Updated Sales Rep expense', {
          expenseId,
          project,
          oldAmount: existingExpense.amount,
          newAmount: roundedCommission,
          allocationPercentage: allocationPercentage.toFixed(2) + '%',
          salesInProject: group.count
        });
      } else {
        // Create new expense
        await createExpense({
          fields: expenseFields
        });
        
        created++;
        
        logger.info('✅ Created Sales Rep expense', {
          expenseId,
          project,
          allocatedCommission: roundedCommission,
          allocationPercentage: allocationPercentage.toFixed(2) + '%',
          salesInProject: group.count
        });
      }
    } catch (error) {
      logger.error('Failed to create/update expense for Sales Rep commission', {
        expenseId,
        project,
        error: error.message
      });
      skipped++;
    }
  }
  
  return { created, updated, skipped };
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
        count: 0,
        sales: []
      };
    }
    
    groups[project].total += amount;
    groups[project].count++;
    groups[project].sales.push({
      id: sale.id,
      amount: amount
    });
  }
  
  return groups;
}

