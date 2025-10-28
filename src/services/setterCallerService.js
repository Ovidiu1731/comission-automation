/**
 * Setter/Caller Commission Processing
 * 
 * Processes 5% commissions for lead generators (people named in Utm Campaign).
 * Filters valid CamelCase names and looks up roles from Reprezentanți table.
 */
import {
  getSetterCallerSales,
  getRepresentativeByName,
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
import {
  isValidSetterCallerName,
  extractSetterCallerName,
  isValidExpenseAmount,
  isValidProject
} from '../utils/validators.js';
import { logger } from '../utils/logger.js';

/**
 * Process all Setter/Caller commissions for current month
 */
export async function processSetterCallerCommissions() {
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  const monthYear = `${month} ${year}`;
  
  logger.info('Starting Setter/Caller commission processing', { monthYear });
  
  try {
    // Get all sales with Utm Campaign for current month
    const sales = await getSetterCallerSales(monthYear);
    
    if (sales.length === 0) {
      logger.info('No Setter/Caller sales found for current month', { monthYear });
      return {
        processed: 0,
        created: 0,
        skipped: 0,
        errors: 0
      };
    }
    
    // Group sales by setter/caller name and project
    const groupedSales = groupSalesBySetterCallerAndProject(sales);
    
    logger.info('Grouped Setter/Caller sales', {
      uniqueGroupings: Object.keys(groupedSales).length,
      totalSales: sales.length
    });
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each group
    for (const [key, group] of Object.entries(groupedSales)) {
      try {
        const [name, project] = key.split('||');
        const result = await processSetterCallerGroup(name, project, group, month, year);
        created += result.created;
        skipped += result.skipped;
      } catch (error) {
        logger.error('Failed to process Setter/Caller group', {
          key,
          error: error.message
        });
        errors++;
      }
    }
    
    logger.info('Completed Setter/Caller commission processing', {
      totalGroupings: Object.keys(groupedSales).length,
      created,
      skipped,
      errors
    });
    
    return {
      processed: Object.keys(groupedSales).length,
      created,
      skipped,
      errors
    };
  } catch (error) {
    logger.error('Setter/Caller commission processing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Process a group of sales for a specific setter/caller and project
 */
async function processSetterCallerGroup(name, project, group, month, year) {
  const { totalCommission, salesCount } = group;
  
  logger.debug('Processing Setter/Caller group', {
    name,
    project,
    totalCommission,
    salesCount
  });
  
  // Validate project
  if (!isValidProject(project)) {
    logger.warn('Invalid project name, skipping', {
      name,
      project
    });
    return { created: 0, skipped: 1 };
  }
  
  // Validate commission amount
  if (!isValidExpenseAmount(totalCommission)) {
    logger.warn('Invalid commission amount, skipping', {
      name,
      project,
      totalCommission
    });
    return { created: 0, skipped: 1 };
  }
  
  // Round to 2 decimal places
  const roundedCommission = Math.round(totalCommission * 100) / 100;
  
  // Look up role from Reprezentanți table
  const role = await lookupSetterCallerRole(name);
  
  // Determine expense category based on role
  let category;
  if (role === 'Caller') {
    category = EXPENSE_CATEGORIES.CALLER;
  } else if (role === 'Setter') {
    category = EXPENSE_CATEGORIES.SETTER;
  } else {
    // Default to Setter if role not found or unknown
    logger.warn('Unknown role, defaulting to Setter', {
      name,
      role
    });
    category = EXPENSE_CATEGORIES.SETTER;
  }
  
  // Generate unique expense ID
  const expenseId = `setter_caller_${name}_${project}_${month.toLowerCase()}`;
  
  // Check if expense already exists
  const exists = await expenseExists(expenseId);
  if (exists) {
    logger.debug('Expense already exists, skipping', {
      expenseId,
      name,
      project,
      month
    });
    return { created: 0, skipped: 1 };
  }
  
  // Create expense record
  try {
    const expenseData = {
      fields: {
        [FIELDS.EXPENSE_DESCRIPTION]: `${name} - ${month}`,
        [FIELDS.EXPENSE_TYPE]: EXPENSE_TYPES.COMMISSIONS,
        [FIELDS.EXPENSE_PROJECT]: project,
        [FIELDS.EXPENSE_CATEGORY]: category,
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
    
    logger.info('Created Setter/Caller expense', {
      expenseId,
      name,
      project,
      category,
      totalCommission: roundedCommission,
      salesCount
    });
    
    return { created: 1, skipped: 0 };
  } catch (error) {
    logger.error('Failed to create expense for Setter/Caller', {
      expenseId,
      name,
      project,
      error: error.message
    });
    return { created: 0, skipped: 1 };
  }
}

/**
 * Look up Setter/Caller role from Reprezentanți table
 * Returns 'Setter' as default if not found
 */
async function lookupSetterCallerRole(name) {
  logger.debug('Looking up role for Setter/Caller', { name });
  
  try {
    const representative = await getRepresentativeByName(name);
    
    if (!representative) {
      logger.warn('Representative not found, defaulting to Setter', { name });
      return 'Setter';
    }
    
    const role = representative.role;
    logger.debug('Found role for Setter/Caller', { name, role });
    
    return role || 'Setter';
  } catch (error) {
    logger.error('Failed to look up role, defaulting to Setter', {
      name,
      error: error.message
    });
    return 'Setter';
  }
}

/**
 * Group sales by Setter/Caller name and project
 * Filters out invalid names
 */
function groupSalesBySetterCallerAndProject(sales) {
  const groups = {};
  let skippedCount = 0;
  
  for (const sale of sales) {
    const utmCampaign = sale.utmCampaign;
    const project = sale.project;
    const setterCallerCommission = sale.setterCallerCommission;
    
    // Validate project
    if (!isValidProject(project)) {
      logger.debug('Sale missing project, skipping', { saleId: sale.id });
      skippedCount++;
      continue;
    }
    
    // Validate commission amount
    if (!setterCallerCommission || setterCallerCommission <= 0) {
      logger.debug('Sale has zero Setter/Caller commission, skipping', {
        saleId: sale.id
      });
      skippedCount++;
      continue;
    }
    
    // Extract valid name from Utm Campaign
    const name = extractSetterCallerName(utmCampaign);
    
    if (!name) {
      logger.debug('Invalid Utm Campaign name, skipping', {
        saleId: sale.id,
        utmCampaign
      });
      skippedCount++;
      continue;
    }
    
    // Validate name format
    if (!isValidSetterCallerName(name)) {
      logger.debug('Name does not match required format, skipping', {
        saleId: sale.id,
        name
      });
      skippedCount++;
      continue;
    }
    
    // Create group key: name||project
    const key = `${name}||${project}`;
    
    if (!groups[key]) {
      groups[key] = {
        name,
        project,
        totalCommission: 0,
        salesCount: 0,
        sales: []
      };
    }
    
    groups[key].totalCommission += setterCallerCommission;
    groups[key].salesCount++;
    groups[key].sales.push({
      id: sale.id,
      amount: sale.amountWithoutVat,
      commission: setterCallerCommission
    });
  }
  
  logger.info('Grouped Setter/Caller sales by name and project', {
    uniqueGroupings: Object.keys(groups).length,
    totalSales: sales.length,
    skippedSales: skippedCount
  });
  
  return groups;
}

