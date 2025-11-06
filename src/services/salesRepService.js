/**
 * Sales Representative Commission Processing
 * 
 * Processes monthly commissions for Sales reps, allocating them
 * across projects based on proportional sales.
 */
import {
  getMonthlyCommissions,
  getAllMonthsWithCommissions,
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
  VAT_INCLUDED,
  SOURCE,
  getCurrentRomanianMonth,
  getCurrentYear
} from '../config/constants.js';
import { isSalesRole, isValidExpenseAmount, isValidProject } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Process Sales Rep commissions
 * @param {string} targetMonthYear - Optional. Format: "Luna YYYY" (e.g., "Octombrie 2025"). If provided, only processes that month.
 */
export async function processSalesRepCommissions(targetMonthYear = null) {
  if (targetMonthYear) {
    logger.info(`Starting Sales Rep commission processing for: ${targetMonthYear}`);
  } else {
    logger.info('Starting Sales Rep commission processing for ALL months');
  }
  
  try {
    // Get all unique months with commissions
    let months = await getAllMonthsWithCommissions();
    
    // If targetMonthYear is provided, extract month and filter
    if (targetMonthYear) {
      const [targetMonth] = targetMonthYear.split(' ');
      months = months.filter(month => month === targetMonth);
      logger.info(`Filtered to single month: ${targetMonth}`);
    }
    
    if (months.length === 0) {
      logger.info('No months with commissions found', { targetMonthYear });
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
      logger.info(`\n========== Processing month: ${month} ==========`);
      const result = await processSalesRepCommissionsForMonth(month);
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      totalProcessed += result.processed;
    }
    
    logger.info('Completed Sales Rep commission processing', {
      targetMonthYear,
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
    logger.error('Failed to process Sales Rep commissions', {
      error: error.message,
      stack: error.stack,
      targetMonthYear
    });
    throw error;
  }
}

/**
 * Process Sales Rep commissions for a specific month
 */
async function processSalesRepCommissionsForMonth(month) {
  const year = getCurrentYear(); // We assume all months are for current year
  
  logger.info('Processing Sales Rep commissions for month', { month, year });
  
  try {
    // Get all monthly commissions for this month
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
  
  // Group sales by project and track sale amounts (not commissions)
  // We'll allocate the finalCommission from Comisioane Lunare proportionally
  const projectGroups = {};
  let totalSalesAmount = 0;
  
  for (const sale of sales) {
    const project = sale.project;
    const saleAmount = sale.totalAmount || 0;  // Use sale AMOUNT, not commission
    
    if (!project) {
      logger.debug('Sale missing project, skipping', { saleId: sale.id });
      continue;
    }
    
    if (!isValidProject(project)) {
      logger.debug('Invalid project name, skipping sale', {
        saleId: sale.id,
        project
      });
      continue;
    }
    
    if (saleAmount <= 0) {
      logger.debug('Sale amount is zero or invalid, skipping', {
        saleId: sale.id,
        amount: saleAmount
      });
      continue;
    }
    
    if (!projectGroups[project]) {
      projectGroups[project] = {
        totalAmount: 0,  // Track sale amounts, not commissions
        salesCount: 0,
        saleIds: []
      };
    }
    
    projectGroups[project].totalAmount += saleAmount;
    projectGroups[project].salesCount++;
    projectGroups[project].saleIds.push(sale.id);
    totalSalesAmount += saleAmount;
  }
  
  if (Object.keys(projectGroups).length === 0) {
    logger.warn('No valid projects found in sales, skipping', { commissionId });
    return { created: 0, updated: 0, skipped: 1 };
  }
  
  // Log the allocation breakdown
  logger.info('Commission allocation breakdown', {
    commissionId,
    totalCommissionFromComisioane: netCommission,
    totalSalesAmount: totalSalesAmount,
    projectCount: Object.keys(projectGroups).length
  });
  
  // Create expense for each project with proportional allocation
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  logger.info('About to create expenses for projects', { 
    commissionId, 
    projectCount: Object.keys(projectGroups).length,
    projects: Object.keys(projectGroups)
  });
  
  for (const [project, group] of Object.entries(projectGroups)) {
    // Calculate proportional allocation based on sale amounts
    const allocationPercentage = totalSalesAmount > 0 ? (group.totalAmount / totalSalesAmount) : 0;
    const allocatedCommission = netCommission * allocationPercentage;
    
    logger.info('Processing project with proportional allocation', { 
      commissionId, 
      project, 
      projectSalesAmount: group.totalAmount,
      totalSalesAmount: totalSalesAmount,
      allocationPercentage: (allocationPercentage * 100).toFixed(2) + '%',
      allocatedCommission: allocatedCommission.toFixed(2),
      salesCount: group.salesCount
    });
    
    // Round to 2 decimal places
    const roundedCommission = Math.round(allocatedCommission * 100) / 100;
    
    // Generate unique expense ID per project
    const expenseId = `commission_${commissionId}_${project}`;
    
    // Check if expense already exists
    logger.info('Checking if expense exists', { commissionId, expenseId, project });
    const existingExpense = await getExpenseByExpenseId(expenseId);
    
    // Build description
    let description = `${representativeName || name.split(' - ')[0]} - ${month}`;
    
    // Sale IDs array (all sales for this project)
    const saleIds = group.saleIds;
    
    // Prepare expense data
    const expenseFields = {
      [FIELDS.EXPENSE_DESCRIPTION]: description,
      [FIELDS.EXPENSE_PROJECT]: project,
      [FIELDS.EXPENSE_CATEGORY]: EXPENSE_CATEGORIES.REPRESENTATIVES,
      [FIELDS.EXPENSE_AMOUNT]: roundedCommission,
      [FIELDS.EXPENSE_VAT_INCLUDED]: VAT_INCLUDED.NO,
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
          salesCount: group.salesCount
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
          commission: roundedCommission,
          salesCount: group.salesCount
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


